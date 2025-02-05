import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from "../interfaces/StepResult";
import { ArtifactManager } from "src/tools/artifactManager";
import { Artifact, ArtifactType } from "src/tools/artifact";
import { ModelHelpers } from "src/llm/modelHelpers";
import { ContentType } from "src/llm/promptBuilder";
import { ModelType } from "src/llm/LLMServiceFactory";
import { ExecutorType } from "../interfaces/ExecutorType";
import { session } from 'electron';
import { v4 as uuidv4 } from 'uuid';

interface APICall {
    url: string;
    method: string;
    requestHeaders: Record<string, string>;
    requestBody?: any;
    responseHeaders: Record<string, string>;
    responseBody: any;
    statusCode: number;
    timestamp: number;
}

interface APIScrapeResponse extends StepResponse {
    type: StepResponseType.WebPage;
    data?: {
        apiCalls: APICall[];
        summary: string;
    };
}

@StepExecutorDecorator(ExecutorType.API_SCRAPER, 'Scrapes API calls made by a web page')
export class APIScraperExecutor implements StepExecutor<APIScrapeResponse> {
    private artifactManager: ArtifactManager;
    private modelHelpers: ModelHelpers;
    private apiCalls: APICall[] = [];
    private monitoringSession: Electron.Session | null = null;

    constructor(params: ExecutorConstructorParams) {
        this.artifactManager = params.artifactManager;
        this.modelHelpers = params.modelHelpers;
    }

    private setupAPIMonitoring(session: Electron.Session) {
        this.apiCalls = [];
        this.monitoringSession = session;

        session.webRequest.onBeforeRequest((details, callback) => {
            if (details.resourceType === 'xhr' || details.resourceType === 'fetch') {
                const apiCall: APICall = {
                    url: details.url,
                    method: details.method,
                    requestHeaders: details.requestHeaders,
                    requestBody: details.uploadData ? details.uploadData[0]?.bytes?.toString() : undefined,
                    responseHeaders: {},
                    responseBody: null,
                    statusCode: 0,
                    timestamp: Date.now()
                };
                this.apiCalls.push(apiCall);
            }
            callback({ cancel: false });
        });

        session.webRequest.onHeadersReceived((details, callback) => {
            if (details.resourceType === 'xhr' || details.resourceType === 'fetch') {
                const call = this.apiCalls.find(c => c.url === details.url);
                if (call) {
                    call.responseHeaders = details.responseHeaders || {};
                }
            }
            callback({ cancel: false });
        });

        session.webRequest.onResponseStarted((details) => {
            if (details.resourceType === 'xhr' || details.resourceType === 'fetch') {
                const filter = session.webRequest.filterResponseData(details.requestId);
                let data = '';

                filter.on('data', (chunk) => {
                    data += chunk.toString();
                });

                filter.on('end', () => {
                    const call = this.apiCalls.find(c => c.url === details.url);
                    if (call) {
                        call.statusCode = details.statusCode;
                        try {
                            call.responseBody = JSON.parse(data);
                        } catch {
                            call.responseBody = data;
                        }
                    }
                    filter.close();
                });
            }
        });
    }

    private async saveAPICallsAsArtifact(projectId: string): Promise<Artifact> {
        const artifact: Artifact = {
            id: uuidv4(),
            type: ArtifactType.Document,
            content: JSON.stringify(this.apiCalls, null, 2),
            metadata: {
                title: 'Captured API Calls',
                description: `API calls captured during scraping`,
                timestamp: new Date().toISOString(),
                count: this.apiCalls.length
            }
        };

        return this.artifactManager.saveArtifact(artifact, projectId);
    }

    async execute(params: ExecuteParams): Promise<StepResult<APIScrapeResponse>> {
        if (!params.context?.browserSession) {
            return {
                finished: true,
                needsUserInput: true,
                response: {
                    type: StepResponseType.WebPage,
                    message: 'No browser session available for API scraping'
                }
            };
        }

        // Setup monitoring
        this.setupAPIMonitoring(params.context.browserSession);

        // Wait for API calls to be captured
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

        // Save captured API calls as an artifact
        const artifact = await this.saveAPICallsAsArtifact(params.projectId);

        // Generate a summary of the captured calls
        const summary = `Captured ${this.apiCalls.length} API calls. ` +
            `Most common endpoint: ${this.getMostCommonEndpoint()}`;

        return {
            finished: true,
            artifactIds: [artifact.id],
            response: {
                type: StepResponseType.WebPage,
                message: `Successfully captured ${this.apiCalls.length} API calls`,
                data: {
                    apiCalls: this.apiCalls,
                    summary
                }
            }
        };
    }

    private getMostCommonEndpoint(): string {
        const endpointCounts = this.apiCalls.reduce((acc, call) => {
            const endpoint = new URL(call.url).pathname;
            acc[endpoint] = (acc[endpoint] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        return Object.entries(endpointCounts)
            .sort((a, b) => b[1] - a[1])
            [0][0] || 'None';
    }
}
