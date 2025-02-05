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
import { session, BrowserWindow } from 'electron';
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
    private browserWindow: BrowserWindow | null = null;

    constructor(params: ExecutorConstructorParams) {
        this.artifactManager = params.artifactManager;
        this.modelHelpers = params.modelHelpers;
    }

    private async createBrowserSession(): Promise<Electron.Session> {
        this.browserWindow = new BrowserWindow({
            show: false, // Run in headless mode
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true
            }
        });

        return this.browserWindow.webContents.session;
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

    private async saveAPICallsAsArtifact(projectId: string): Promise<{allCalls: Artifact, largestPayload?: Artifact}> {
        // Save all API calls
        const allCallsArtifact: Artifact = {
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

        // Find the largest JSON payload
        let largestPayload: Artifact | undefined;
        let largestSize = 0;

        for (const call of this.apiCalls) {
            if (typeof call.responseBody === 'object' && call.responseBody !== null) {
                const jsonStr = JSON.stringify(call.responseBody);
                const size = jsonStr.length;
                
                if (size > largestSize) {
                    largestSize = size;
                    largestPayload = {
                        id: uuidv4(),
                        type: ArtifactType.Document,
                        content: jsonStr,
                        metadata: {
                            title: `Largest JSON Payload from ${new URL(call.url).pathname}`,
                            description: `Largest JSON payload captured during API scraping`,
                            timestamp: new Date().toISOString(),
                            sourceUrl: call.url,
                            sizeBytes: size,
                            statusCode: call.statusCode
                        }
                    };
                }
            }
        }

        // Save artifacts
        const savedAllCalls = await this.artifactManager.saveArtifact(allCallsArtifact, projectId);
        let savedLargestPayload: Artifact | undefined;
        
        if (largestPayload) {
            savedLargestPayload = await this.artifactManager.saveArtifact(largestPayload, projectId);
        }

        return {
            allCalls: savedAllCalls,
            largestPayload: savedLargestPayload
        };
    }

    async execute(params: ExecuteParams): Promise<StepResult<APIScrapeResponse>> {
        try {
            const browserSession = await this.createBrowserSession();
            // Setup monitoring
            this.setupAPIMonitoring(browserSession);

        // Wait for API calls to be captured
        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds

        // Save captured API calls and largest payload
        const {allCalls, largestPayload} = await this.saveAPICallsAsArtifact(params.projectId);

        // Generate a summary of the captured calls
        let summary = `Captured ${this.apiCalls.length} API calls. ` +
            `Most common endpoint: ${this.getMostCommonEndpoint()}`;
            
        if (largestPayload) {
            summary += `\nLargest JSON payload: ${largestPayload.metadata?.title} (${largestPayload.metadata?.sizeBytes} bytes)`;
        }

        // Clean up browser window
        if (this.browserWindow) {
            this.browserWindow.close();
            this.browserWindow = null;
        }

        return {
            finished: true,
            artifactIds: [allCalls.id, ...(largestPayload ? [largestPayload.id] : [])],
            response: {
                type: StepResponseType.WebPage,
                message: `Successfully captured ${this.apiCalls.length} API calls`,
                data: {
                    apiCalls: this.apiCalls,
                    summary
                }
            }
        };
        } catch (error) {
            return {
                finished: true,
                needsUserInput: true,
                response: {
                    type: StepResponseType.WebPage,
                    message: `Failed to create browser session: ${error}`
                }
            };
        }
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
