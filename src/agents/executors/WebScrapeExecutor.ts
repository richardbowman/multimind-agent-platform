import Logger from "src/helpers/logger";
import ScrapeHelper, { LinkRef } from "src/helpers/scrapeHelper";
import { ILLMService } from "src/llm/ILLMService";
import { ArtifactManager } from "src/tools/artifactManager";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from "../interfaces/StepResult";
import { ModelMessageResponse } from "src/schemas/ModelResponse";
import { ExecutorType } from "../interfaces/ExecutorType";
import { createUUID } from "src/types/uuid";
import { Artifact, ArtifactType } from "src/tools/artifact";
import { ModelHelpers, WithTokens } from "src/llm/modelHelpers";
import { ContentType, OutputType } from "src/llm/promptBuilder";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { SchemaType } from "src/schemas/SchemaTypes";
import { StringUtils } from "src/utils/StringUtils";
import { WebScrapeSummaryResponse } from "src/schemas/DateResponse";
import { ModelType } from "src/llm/LLMServiceFactory";
import { SearchCategory } from "src/schemas/SearchQueryResponse";

export interface ScrapeResult {
    artifacts: Artifact[];
    summaries: SummaryResponse[];
    extractedLinks: LinkRef[];
    error?: string;
}

export interface ScrapeStepResponse extends StepResponse {
    type: StepResponseType.WebPage;
    data: ScrapeResult;
}

interface SummaryResponse extends WebScrapeSummaryResponse {
    summary: string;
}

@StepExecutorDecorator(ExecutorType.WEB_SCRAPE, 'Scrapes and summarizes webpage content')
export class WebScrapeExecutor implements StepExecutor<ScrapeStepResponse> {
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

    async execute(params: ExecuteParams): Promise<StepResult<ScrapeStepResponse>> {
        // First try to extract URLs from stepGoal
        let selectedUrls = [...new Set(StringUtils.extractUrls(params.goal))];

        // If no URLs in stepGoal, check previousResponses (LinkSelectionExecutor)
        if (!selectedUrls?.length) {
            selectedUrls = params.previousResponses?.map(r => r.data?.selectedUrls).filter(s => s).slice(-1)[0];
        }

        const isNews = params.previousResponses?.some(r =>
            r.data?.searchResults?.some(s => s.category === SearchCategory.News)
        );

        if (!selectedUrls?.length) {
            return {
                finished: true,
                response: {
                    type: StepResponseType.WebPage,
                    message: 'No URLs to scrape',
                    data: {
                        artifacts: [],
                        summaries: [],
                        extractedLinks: [],
                        error: 'No URLs to scrape'
                    }
                }
            };
        }

        const scrapedUrls = await this.getScrapedUrls();
        let summaries = [];

        const result: ScrapeResult = {
            artifacts: [],
            summaries: [],
            extractedLinks: []
        };

        const total = selectedUrls.length;

        for (const [index, url] of selectedUrls.entries()) {
            try {
                if (isNews) {
                    // For news, always fetch fresh content                                                                                         
                    const { content, title, links } = await this.scrapeHelper.scrapePage(url, {
                        task: params.stepGoal,
                        projectId: params.projectId
                    });

                    const artifact = await this.saveArtifactForNews(content, {
                        title,
                        url,
                        task: params.stepGoal,
                        projectId: params.projectId
                    });

                    result.artifacts.push(artifact);
                    result.extractedLinks.push(...links);
                } else {

                    // Check if already processed
                    if (this.visitedUrls.has(url) || scrapedUrls.has(url)) {
                        Logger.info(`Retrieving existing summary for URL: ${url}`);
                        const webPage = await this.getStoredWebpage(url);
                        const existingSummary = await this.getStoredSummary(url);
                        if (webPage && existingSummary) {
                            result.artifacts.push(webPage);
                            result.summaries.push(existingSummary);
                            result.extractedLinks = [...new Set([
                                ...result.extractedLinks,
                                ...StringUtils.extractLinksFromMarkdown(webPage.content.toString())
                            ])];
                            continue;
                        }
                    }

                    this.visitedUrls.add(url);

                    // Scrape page
                    await params.partialResponse(`Scraping ${url} (${index + 1} of ${total})...`);

                    const { content, title, links } = await this.scrapeHelper.scrapePage(url, {
                        task: params.stepGoal,
                        projectId: params.projectId
                    });

                    result.extractedLinks.push(...links);

                    // Generate summary
                    await params.partialResponse(`Summarizing ${title} (${index + 1} of ${total})...`);

                    const summaryResponse = await this.summarizeContent(
                        params.stepGoal,
                        `Page Title: ${title}\nURL: ${url}\n\n${content}`,
                        params
                    );

                    if (summaryResponse.relevant) {
                        const artifact = await this.artifactManager.saveArtifact({
                            id: createUUID(),
                            type: ArtifactType.Document,
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
                }

            } catch (error) {
                Logger.error(`Error processing URL ${url}`, error);
            }
        }

        return {
            finished: true,
            replan: ReplanType.Allow,
            type: StepResultType.WebScrapeStepResult,
            artifactIds: result.artifacts.map(a => a.id),
            response: {
                type: StepResponseType.WebPage,
                message: `Scraped ${result.artifacts.length} pages:\n\n${result.summaries.map(s => s.summary).join('\n\n---\n\n')}`,
                data: {
                    artifacts: result.artifacts,
                    summaries: result.summaries,
                    extractedLinks: [...new Set(result.extractedLinks)] // Deduplicate links
                }
            }
        };
    }

    private async saveArtifactForNews(content: string, metadata: any): Promise<Artifact> {                                                          
        // For news, we'll save a summary but not the full content                                                                                  
        const summary = await this.generateNewsSummary(content);                                                                                    
                                                                                                                                                    
        return this.artifactManager.saveArtifact({                                                                                                  
            id: createUUID(),                                                                                                                       
            type: ArtifactType.Document,                                                                                                            
            content: summary,                                                                                                                       
            metadata: {                                                                                                                             
                ...metadata,                                                                                                                        
                isTimeSensitive: true,                                                                                                              
                contentDate: new Date(),                                                                                                            
                expirationDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours                                                              
            }                                                                                                                                       
        });                                                                                                                                         
    } 
    
    private async getStoredWebpage(url: string): Promise<Artifact | null> {
        const existingSummaries = await this.artifactManager.getArtifacts({
            type: 'webpage'
        });
        const artifact = existingSummaries.find(a => a.metadata?.url === url);
        return artifact || null;
    }

    private async getStoredSummary(url: string): Promise<SummaryResponse | null> {
        const existingSummaries = await this.artifactManager.getArtifacts({
            type: 'summary'
        });
        const artifact = existingSummaries.find(a => a.metadata?.url === url);
        if (artifact) {
            return {
                summary: artifact.content.toString(),
                date: artifact.metadata?.contentDate,
                relevant: true
            }
        } else {
            return null;
        }
    }

    private async getScrapedUrls(): Promise<Set<string>> {
        const artifacts = await this.artifactManager.getArtifacts({ type: 'webpage' });
        return new Set(artifacts.map(a => a.metadata?.url));
    }

    private async summarizeContent(task: string, content: string, params: ExecuteParams): Promise<WithTokens<SummaryResponse>> {
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`You are a step in an agent. The goal is to summarize a web search result.
            If the page is relevant to the goals, create a report in Markdown of all of the specific information from the provided web page.
            If the page is not relevant, specify the 'relevant' flag as false.`);
        prompt.addContext({ contentType: ContentType.PURPOSE });
        prompt.addContext({ contentType: ContentType.GOALS_FULL, params });
        prompt.addContext({ contentType: ContentType.EXECUTE_PARAMS, params });

        const schema = await getGeneratedSchema(SchemaType.WebScrapeSummaryResponse);
        prompt.addOutputInstructions(OutputType.JSON_AND_MARKDOWN, schema);

        const userPrompt = "Web Search Result:" + content;

        const summary = await this.modelHelpers.generate({
            instructions: prompt.build(),
            message: userPrompt,
            threadPosts: params.context?.threadPosts,
            model: ModelType.DOCUMENT
        });

        const jsonBlock = StringUtils.extractAndParseJsonBlock(summary.message, schema);
        const markdownBlocks = StringUtils.extractCodeBlocks(summary.message, "markdown");

        return {
            ...jsonBlock as WebScrapeSummaryResponse,
            summary: markdownBlocks[0].code
        };
    }

    private async generateNewsSummary(content: string): Promise<string> {
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`You are a news summarizer. Create a concise summary of the key points from this news article.                        
            Focus on the who, what, when, where, and why. Keep it under 200 words.`);

        const response = await this.modelHelpers.generate({
            instructions: prompt.build(),
            message: content,
            model: ModelType.DOCUMENT
        });

        return response.message;
    }

    private async cleanupExpiredNews() {
        const newsArtifacts = await this.artifactManager.getArtifacts({
            metadata: { isTimeSensitive: true }
        });

        const now = new Date();
        for (const artifact of newsArtifacts) {
            if (artifact.metadata?.expirationDate &&
                new Date(artifact.metadata.expirationDate) < now) {
                await this.artifactManager.deleteArtifact(artifact.id);
            }
        }
    }
}
