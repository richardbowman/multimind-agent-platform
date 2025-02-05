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
import { StringUtils } from "src/utils/StringUtils";

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

    private async createBrowserSession(): Promise<void> {
        this.browserWindow = new BrowserWindow({
            show: false, // Run in headless mode
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true,
                partition: 'persist:api-scraper'
            }
        });

        try {
            await this.browserWindow.webContents.debugger.attach('1.3');
        } catch (err) {
            console.error('Debugger attach failed:', err);
            throw err;
        }

        this.browserWindow.webContents.debugger.on('detach', (event, reason) => {
            console.log('Debugger detached due to:', reason);
        });
    }

    private setupAPIMonitoring() {
        this.apiCalls = [];

        if (!this.browserWindow) {
            throw new Error('Browser window not initialized');
        }

        const _debugger = this.browserWindow.webContents.debugger;

        _debugger.on('message', (event, method, params) => {
            if (method === 'Network.requestWillBeSent') {
                const apiCall: APICall = {
                    url: params.request.url,
                    method: params.request.method,
                    requestHeaders: params.request.headers,
                    requestBody: params.request.postData,
                    responseHeaders: {},
                    responseBody: null,
                    statusCode: 0,
                    timestamp: Date.now()
                };
                this.apiCalls.push(apiCall);
            }
            else if (method === 'Network.responseReceived') {
                const call = this.apiCalls.find(c => c.url === params.response.url);
                if (call) {
                    call.responseHeaders = params.response.headers;
                    call.statusCode = params.response.status;
                    _debugger.sendCommand('Network.getResponseBody', { requestId: params.requestId })
                    .then(response => {
                        try {
                            call.responseBody = JSON.parse(response.body);
                        } catch {
                            call.responseBody = response.body;
                        }
                    })
                    .catch(err => {
                        console.error('Error getting response body:', err);
                    });
                }
            }
        });

        _debugger.sendCommand('Network.enable');
    }

    private async saveAPICallsAsArtifact(projectId: string): Promise<{allCalls: Artifact, largestPayloads: Artifact[]}> {
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

        // Find and save all significant JSON payloads
        const largestPayloads: Partial<Artifact>[] = [];
        const payloadSizeThreshold = 1024; // 1KB minimum size

        for (const call of this.apiCalls) {
            if (typeof call.responseBody === 'object' && call.responseBody !== null) {
                const jsonStr = JSON.stringify(call.responseBody);
                const size = jsonStr.length;
                
                if (size >= payloadSizeThreshold) {
                    largestPayloads.push({
                        type: ArtifactType.APIData,
                        content: jsonStr,
                        metadata: {
                            title: `JSON Payload from ${new URL(call.url).pathname}`,
                            mimeType: 'application/json',
                            description: `JSON payload captured during API scraping`,
                            timestamp: new Date().toISOString(),
                            sourceUrl: call.url,
                            sizeBytes: size,
                            statusCode: call.statusCode,
                            method: call.method,
                            projectId: projectId
                        }
                    });
                }
            }
        }

        // Sort payloads by size descending and keep top 10 payloads
        const payloads = largestPayloads.sort((a, b) => (b.metadata?.sizeBytes || 0) - (a.metadata?.sizeBytes || 0)).slice(0,10);

        // Save artifacts
        // const savedAllCalls = await this.artifactManager.saveArtifact(allCallsArtifact, projectId);
        const savedPayloads = await Promise.all(payloads.map(payload => this.artifactManager.saveArtifact(payload)));

        return {
            allCalls: allCallsArtifact, //savedAllCalls,
            largestPayloads: savedPayloads
        };
    }

    async execute(params: ExecuteParams): Promise<StepResult<APIScrapeResponse>> {
        try {
            await this.createBrowserSession();
            // Setup monitoring
            this.setupAPIMonitoring();

            // Extract URLs from step goal or previous responses
            let urlsToScrape = StringUtils.extractUrls(params.stepGoal);
            if (!urlsToScrape.length && params.previousResponses) {
                urlsToScrape = params.previousResponses
                    .map(r => r.data?.selectedUrls)
                    .filter(s => s)
                    .flat() || [];
            }

            if (!urlsToScrape.length) {
                return {
                    finished: true,
                    response: {
                        type: StepResponseType.WebPage,
                        message: 'No URLs provided to scrape'
                    }
                };
            }

            // Load each URL and wait for API calls
            for (const url of urlsToScrape) {
                if (this.browserWindow) {
                    await this.browserWindow.loadURL(url);
                    // Wait for page to load and API calls to complete
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds per page
                }
            }

        // Save captured API calls and payloads
        const {allCalls, largestPayloads} = await this.saveAPICallsAsArtifact(params.projectId);

        // Generate a summary of the captured calls
        let summary = `Captured ${this.apiCalls.length} API calls. ` +
            `Most common endpoint: ${this.getMostCommonEndpoint()}\n\n` +
            `Significant JSON payloads found: ${largestPayloads.length}\n`;

        if (largestPayloads.length > 0) {
            summary += `Top 3 largest payloads:\n` +
                largestPayloads.slice(0, 3).map(payload => 
                    `- ${payload.metadata?.title} (${payload.metadata?.sizeBytes} bytes)`
                ).join('\n');
        }

        // Clean up browser window
        if (this.browserWindow) {
            this.browserWindow.close();
            this.browserWindow = null;
        }

        return {
            finished: true,
            artifactIds: [...largestPayloads.map(a => a.id)],
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
