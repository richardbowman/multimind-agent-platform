import Logger from "src/helpers/logger";
import ScrapeHelper, { LinkRef } from "src/helpers/scrapeHelper";
import { ILLMService } from "src/llm/ILLMService";
import { ArtifactManager } from "src/tools/artifactManager";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { StepResult } from "../interfaces/StepResult";
import { ModelMessageResponse } from "src/schemas/ModelResponse";
import { ExecutorType } from "../interfaces/ExecutorType";
import { createUUID } from "src/types/uuid";
import { Artifact } from "src/tools/artifact";
import { ModelHelpers } from "src/llm/modelHelpers";
import { ContentType, OutputType } from "src/llm/promptBuilder";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { SchemaType } from "src/schemas/SchemaTypes";
import { StringUtils } from "src/utils/StringUtils";
import { WebScrapeSummaryResponse } from "src/schemas/DateResponse";

export interface ScrapeResult {
    artifacts: Artifact[];
    summaries: SummaryResponse[];
    extractedLinks: LinkRef[];
}

interface SummaryResponse extends WebScrapeSummaryResponse {
    summary: string;
}

@StepExecutorDecorator(ExecutorType.WEB_SCRAPE, 'Scrapes and summarizes webpage content')
export class WebScrapeExecutor implements StepExecutor {
    private scrapeHelper: ScrapeHelper;
    private llmService: ILLMService;
    private artifactManager: ArtifactManager;
    private visitedUrls: Set<string> = new Set();
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.scrapeHelper = new ScrapeHelper(params.artifactManager, params.settings);
        this.llmService = params.llmService;
        this.artifactManager = params.artifactManager;
        this.modelHelpers = params.modelHelpers;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        // Get selected URLs from previous step (LinkSelectionExecutor)
        const selectedUrls = params.previousResult?.map(r => r.data?.selectedUrls).filter(s => s).slice(-1)[0];
        if (!selectedUrls?.length) {
            return {
                finished: true,
                response: { message: 'No URLs to scrape' }
            };
        }

        const scrapedUrls = await this.getScrapedUrls();
        let summaries = [];
        
        const result: ScrapeResult = {
            artifacts: [],
            summaries: [],
            extractedLinks: []
        };

        for (const url of selectedUrls) {
            try {
                // Check if already processed
                if (this.visitedUrls.has(url) || scrapedUrls.has(url)) {
                    Logger.info(`Retrieving existing summary for URL: ${url}`);
                    const existingSummary = await this.getExistingSummary(url);
                    if (existingSummary) {
                        result.summaries.push(existingSummary.content.toString());
                        result.artifacts.push(existingSummary);
                        continue;
                    }
                }

                this.visitedUrls.add(url);

                // Scrape page
                await params.partialResponse(`Scraping ${url}...`);
                
                const { content, title, links } = await this.scrapeHelper.scrapePage(url, {
                    task: params.stepGoal,
                    projectId: params.projectId
                });
                
                result.extractedLinks.push(...links);
                
                // Generate summary
                await params.partialResponse(`Summarizing ${title}...`);

                const summaryResponse = await this.summarizeContent(
                    params.stepGoal,
                    `Page Title: ${title}\nURL: ${url}\n\n${content}`,
                    params
                );

                if (summaryResponse.relevant) {
                    const artifact = await this.artifactManager.saveArtifact({
                        id: createUUID(),
                        type: 'summary',
                        content: summaryResponse.summary,
                        metadata: {
                            title: `Summary Report for ${title}`,
                            url,
                            contentDate: summaryResponse.date,
                            task: params.stepGoal,
                            projectId: params.projectId,
                            tokenUsage: summaryResponse._usage
                        },
                        tokenCount: summaryResponse._usage?.outputTokens
                    });
                    
                    result.summaries.push(summaryResponse);
                    result.artifacts.push(artifact);
                }

            } catch (error) {
                Logger.error(`Error processing URL ${url}`, error);
            }
        }

        return {
            finished: true,
            type: 'webpage_scrape',
            artifactIds: result.artifacts.map(a => a.id),
            response: {
                message: `Scraped ${result.artifacts.length} pages:\n\n${result.summaries.join('\n\n---\n\n')}`,
                data: {
                    artifacts: result.artifacts,
                    extractedLinks: [...new Set(result.extractedLinks)] // Deduplicate links
                }
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

    private async summarizeContent(task: string, content: string, params: ExecuteParams): Promise<SummaryResponse> {
        const prompt = this.modelHelpers.createPrompt();
        prompt.addContent(ContentType.PURPOSE);
        prompt.addInstruction(`You are a step in an agent. The goal is to summarize a web search result.
        If the page is relevant to the goals, create a report in Markdown of all of the specific information from the provided web page.
        If the page is not relevant, specify the 'relevant' flag as false.`);
        prompt.addContent(ContentType.OVERALL_GOAL, params.overallGoal);
        prompt.addContent(ContentType.EXECUTE_PARAMS, params);
        await prompt.addOutputInstructions(OutputType.JSON_AND_MARKDOWN, SchemaType.WebScrapeSummaryResponse);

        const userPrompt = "Web Search Result:" + content;
        
        const summary = await this.modelHelpers.generate({
            instructions: prompt.build(),
            message: userPrompt,
            threadPosts: params.context?.threadPosts
        });

        const jsonBlocks = StringUtils.extractAndParseJsonBlocks(summary.message);
        const markdownBlocks = StringUtils.extractCodeBlocks("markdown", summary.message);

        return {
            ...jsonBlocks[0] as WebScrapeSummaryResponse,
            summary: markdownBlocks[0].code
        };
    }
}