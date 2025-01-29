import Logger from "src/helpers/logger";
import ScrapeHelper from "src/helpers/scrapeHelper";
import { ILLMService } from "src/llm/ILLMService";
import { ArtifactManager } from "src/tools/artifactManager";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { StepResult } from "../interfaces/StepResult";
import { ModelMessageResponse } from "src/schemas/ModelResponse";
import { ExecutorType } from "../interfaces/ExecutorType";

@StepExecutorDecorator(ExecutorType.WEB_SCRAPE, 'Scrapes and summarizes webpage content')
export class WebScrapeExecutor implements StepExecutor {
    private scrapeHelper: ScrapeHelper;
    private llmService: ILLMService;
    private artifactManager: ArtifactManager;
    private visitedUrls: Set<string> = new Set();

    constructor(params: ExecutorConstructorParams) {
        this.scrapeHelper = new ScrapeHelper(params.artifactManager, params.settings);
        this.llmService = params.llmService;
        this.artifactManager = params.artifactManager;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        // Get selected URLs from previous step (LinkSelectionExecutor)
        const selectedUrls = params.previousResult?.map(r => r.data?.selectedUrls).slice(-1)[0];
        if (!selectedUrls?.length) {
            return {
                finished: true,
                response: { message: 'No URLs to scrape' }
            };
        }

        const scrapedUrls = await this.getScrapedUrls();
        const artifacts = [];
        let summaries = [];

        for (const url of selectedUrls) {
            try {
                // Check if already processed
                if (this.visitedUrls.has(url) || scrapedUrls.has(url)) {
                    Logger.info(`Retrieving existing summary for URL: ${url}`);
                    const existingSummary = await this.getExistingSummary(url);
                    if (existingSummary) {
                        summaries.push(existingSummary.content.toString());
                        artifacts.push(existingSummary);
                        continue;
                    }
                }

                this.visitedUrls.add(url);

                // Scrape page
                const { content, title } = await this.scrapeHelper.scrapePage(url, {
                    task: params.stepGoal,
                    projectId: params.projectId
                });

                // Generate summary
                const summaryResponse = await this.summarizeContent(
                    params.stepGoal,
                    `Page Title: ${title}\nURL: ${url}\n\n${content}`,
                    this.llmService
                );

                if (summaryResponse.message !== "NOT RELEVANT") {
                    const artifact = await this.artifactManager.saveArtifact({
                        id: crypto.randomUUID(),
                        type: 'summary',
                        content: summaryResponse.message,
                        metadata: {
                            title: `Summary Report for ${title}`,
                            url,
                            task: params.stepGoal,
                            projectId: params.projectId,
                            tokenUsage: summaryResponse._usage
                        },
                        tokenCount: summaryResponse._usage?.outputTokens
                    });
                    
                    summaries.push(summaryResponse.message);
                    artifacts.push(artifact);
                }

            } catch (error) {
                Logger.error(`Error processing URL ${url}`, error);
            }
        }

        return {
            finished: true,
            type: 'webpage_scrape',
            artifactIds: artifacts.map(a => a.id),
            response: {
                message: `Scraped ${artifacts.length} pages:\n\n${summaries.join('\n\n---\n\n')}`,
                data: { artifacts }
            }
        };
    }

    private async getExistingSummary(url: string): Promise<Artifact | null> {
        const existingSummaries = await this.artifactManager.getArtifacts({
            type: 'summary'
        });
        return existingSummaries.find(a => a.metadata?.url === url) || null;
    }

    private async getScrapedUrls(): Promise<Set<string>> {
        const artifacts = await this.artifactManager.getArtifacts({ type: 'webpage' });
        return new Set(artifacts.map(a => a.metadata?.url));
    }

    private async summarizeContent(task: string, content: string, llmService: ILLMService): Promise<ModelMessageResponse> {
        const systemPrompt = `You are a research assistant. The goal is to summarize a web search result for the user's goal of: ${task}.
        Create a report in Markdown of all of the specific information from the provided web page that is relevant to our goal.
        If the page has no relevant information to the goal, respond with NOT RELEVANT.`;

        const userPrompt = "Web Search Result:" + content;
        const summary = await llmService.generate(systemPrompt, { message: userPrompt });

        return summary;
    }
}