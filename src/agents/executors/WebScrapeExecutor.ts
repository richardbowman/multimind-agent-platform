import Logger from "src/helpers/logger";
import ScrapeHelper, { LinkRef } from "src/helpers/scrapeHelper";
import { ILLMService } from "src/llm/ILLMService";
import { ArtifactManager } from "src/tools/artifactManager";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from "../interfaces/StepResult";
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
    url: string
    summary: string;
}

@StepExecutorDecorator(ExecutorType.WEB_SCRAPE, 'Download selected webpage content')
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

        // Find the most recent scrape step
        let lastScrapeIndex = -1;
        if (params.previousResponses?.length) {
            for (let i = params.previousResponses.length - 1; i >= 0; i--) {
                if (params.previousResponses[i].type === StepResponseType.WebPage) {
                    lastScrapeIndex = i;
                    break;
                }
            }
        }

        // If we found a previous scrape step, only include URLs selected after that point
        if (lastScrapeIndex >= 0) {
            const newUrls = new Set<string>();
            // Look through responses after the last scrape step
            for (let i = lastScrapeIndex + 1; i < params.previousResponses.length; i++) {
                const response = params.previousResponses[i];
                if (response.data?.selectedUrls) {
                    response.data.selectedUrls.forEach(url => newUrls.add(url));
                }
            }
            // Filter to only URLs selected after last scrape
            selectedUrls = selectedUrls?.filter(url => newUrls.has(url));
        }

        const isNews = params.previousResponses?.some(r =>
            r.data?.searchResults?.some(s => s.category === SearchCategory.News)
        );

        if (!selectedUrls?.length) {
            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.WebPage,
                    status: 'No URLs selected to scrape',
                    data: {
                        artifacts: [],
                        summaries: [],
                        extractedLinks: [],
                        error: 'No URLs selected to scrape'
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
        
        // Process news articles concurrently
        if (isNews) {
            await params.partialResponse(`Scraping ${total} news articles...`);
            
            const newsPromises = selectedUrls.map(async (url) => {
                try {
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

                    return { artifact, links };
                } catch (error) {
                    Logger.error(`Error processing news URL ${url}`, error);
                    return null;
                }
            });

            const newsResults = await Promise.all(newsPromises);
            for (const newsResult of newsResults) {
                if (newsResult) {
                    result.artifacts.push(newsResult.artifact);
                    result.extractedLinks.push(...newsResult.links);
                }
            }
        } else {
            // Process regular pages with concurrency
            await params.partialResponse(`Scraping ${total} pages...`);
            
            const scrapePromises = selectedUrls.map(async (url) => {
                try {
                    // Check if already processed
                    if (this.visitedUrls.has(url) || scrapedUrls.has(url)) {
                        Logger.info(`Retrieving existing summary for URL: ${url}`);
                        const webPage = await this.getStoredWebpage(url);
                        const existingSummary = await this.getStoredSummary(url);
                        if (webPage && existingSummary) {
                            return {
                                type: 'cached',
                                webPage,
                                existingSummary,
                                links: StringUtils.extractLinksFromMarkdown(webPage.content.toString())
                            };
                        }
                    }

                    this.visitedUrls.add(url);

                    // Scrape page
                    const { content, title, links } = await this.scrapeHelper.scrapePage(url, {
                        task: params.stepGoal,
                        projectId: params.projectId
                    });

                    // Generate summary
                    const summaryResponse = await this.summarizeContent(
                        params.stepGoal,
                        title,
                        url,
                        content,
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
                                tokenUsage: summaryResponse._usage,
                                subtype: 'Webpage Summary'
                            },
                            tokenCount: summaryResponse._usage?.outputTokens
                        });

                        return {
                            type: 'new',
                            artifact,
                            summaryResponse,
                            links
                        };
                    }
                } catch (error) {
                    Logger.error(`Error processing URL ${url}`, error);
                }
                return null;
            });

            const scrapeResults = await Promise.all(scrapePromises);
            for (const scrapeResult of scrapeResults) {
                if (scrapeResult) {
                    if (scrapeResult.type === 'cached') {
                        result.artifacts.push(scrapeResult.webPage);
                        result.summaries.push(scrapeResult.existingSummary);
                        result.extractedLinks = [...new Set([
                            ...result.extractedLinks,
                            ...scrapeResult.links
                        ])];
                    } else {
                        result.artifacts.push(scrapeResult.artifact);
                        result.summaries.push(scrapeResult.summaryResponse);
                        result.extractedLinks.push(...scrapeResult.links);
                    }
                }
            }
        }

        // Create status messages for all URLs
        const statusMessages = selectedUrls.map(url => {
            const artifact = result.artifacts.find(a => a.metadata?.url === url);
            if (artifact) {
                return `✅ Successfully scraped: ${url}`;
            }
            return `❌ Failed to scrape: ${url}`;
        });

        return {
            finished: true,
            replan: ReplanType.Allow,
            type: StepResultType.WebScrapeStepResult,
            artifactIds: result.artifacts.map(a => a.id),
            response: {
                type: StepResponseType.WebPage,
                status: statusMessages.join('\n'),
                data: {
                    artifacts: result.artifacts,
                    summaries: result.summaries,
                    extractedLinks: [...new Set(result.extractedLinks)], // Deduplicate links
                    processedUrls: selectedUrls,
                    successCount: result.artifacts.length,
                    failureCount: selectedUrls.length - result.artifacts.length
                }
            }
        };
    }

    private async saveArtifactForNews(content: string, metadata: any): Promise<Artifact> {                                                          
        // For news, we'll save a summary but not the full content                                                                                  
        const {summary, publishedDate} = await this.generateNewsSummary(content);                                                                                    
                                                                                                                                                    
        return this.artifactManager.saveArtifact({                                                                                                  
            id: createUUID(),                                                                                                                       
            type: ArtifactType.Document,                                                                                                            
            content: summary,                                                                                                                       
            metadata: {                                                                                                                             
                ...metadata,                                                                                                                        
                isTimeSensitive: true,                                                                                                              
                contentDate: publishedDate || new Date(),                                                                                                            
                publishedDate: publishedDate,
                expirationDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours                                                              
            }                                                                                                                                       
        });                                                                                                                                         
    } 
    
    private async getStoredWebpage(url: string): Promise<Artifact | null> {
        const existingSummaries = await this.artifactManager.getArtifacts({
            type: 'webpage'
        });
        const itemId = existingSummaries.find(a => a.metadata?.url === url)?.id;
        const artifact = itemId && this.artifactManager.loadArtifact(itemId);
        return artifact || null;
    }

    private async getStoredSummary(url: string): Promise<SummaryResponse | null> {
        const existingSummaries = await this.artifactManager.getArtifacts({
            type: 'summary'
        });
        const artifactInfo = existingSummaries.find(a => a.metadata?.url === url);
        const artifact = artifactInfo && await this.artifactManager.loadArtifact(artifactInfo.id);
        if (artifact) {
            return {
                summary: artifact.content.toString(),
                url: artifact.metadata?.url,
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

    private async summarizeContent(task: string, title: string, url: string, content: string, params: ExecuteParams): Promise<WithTokens<SummaryResponse>> {
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`You are a step in an agent. The goal is to summarize a web search result.
            If the page is relevant to the goals, create a report in Markdown of all of the specific information from the provided web page.
            If the page is not relevant, specify the 'relevant' flag as false.`);
        prompt.addContext({ contentType: ContentType.PURPOSE });
        prompt.addContext({ contentType: ContentType.GOALS_FULL, params });
        prompt.addContext({ contentType: ContentType.EXECUTE_PARAMS, params });

        const schema = await getGeneratedSchema(SchemaType.WebScrapeSummaryResponse);
        prompt.addOutputInstructions({outputType: OutputType.JSON_AND_MARKDOWN, schema, specialInstructions: "the webpage summary"});

        const userPrompt = "Web Search Result:" + `Page Title: ${title}\nURL: ${url}\n\n${content}`;

        const summary = await this.modelHelpers.generate({
            instructions: prompt,
            message: userPrompt,
            threadPosts: params.context?.threadPosts,
            modelType: ModelType.DOCUMENT
        });

        const jsonBlock = StringUtils.extractAndParseJsonBlock(summary.message, schema);
        const markdownBlocks = StringUtils.extractCodeBlocks(summary.message, "markdown");

        if (markdownBlocks.length !== 1) {
            Logger.error("Didn't get a content block");
            return {
                ...jsonBlock as WebScrapeSummaryResponse,
                summary: "[DIDN'T RECEIVE SUMMARY]",
                relevant: false,
                url
            };
        }

        return {
            ...jsonBlock as WebScrapeSummaryResponse,
            summary: markdownBlocks[0].code,
            url
        };
    }

    private async generateNewsSummary(content: string): Promise<{summary: string, publishedDate?: Date}> {
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`You are a news summarizer. Create a concise summary of the key points from this news article.                        
            Focus on the who, what, when, where, and why. Keep it under 200 words.
            Also extract the published date if available in the content. Return the date in ISO format if found and specify like with :
            
            Published Date: ...
            Summary: ...
            .`);

        const response = await this.modelHelpers.generate({
            instructions: prompt,
            message: content,
            modelType: ModelType.DOCUMENT
        });
        const publishedDate = StringUtils.extractCaptionedText(response.message, "Published Date");

        return {
            summary: response.message,
            publishedDate: StringUtils.isValidDate(publishedDate) ? new Date(publishedDate) : undefined
        };
    }

    private async cleanupExpiredNews() {
        const newsArtifacts = (await this.artifactManager.getArtifacts()).filter(a => a.metadata?.isTimeSensitive);

        const now = new Date();
        for (const artifactInfo of newsArtifacts) {
            if (artifactInfo.metadata?.expirationDate &&
                new Date(artifactInfo.metadata.expirationDate) < now) {
                await this.artifactManager.deleteArtifact(artifactInfo.id);
            }
        }
    }
}
