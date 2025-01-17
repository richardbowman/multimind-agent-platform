import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import ScrapeHelper from '../../helpers/scrapeHelper';
import { ILLMService } from "src/llm/ILLMService";
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { StructuredOutputPrompt } from 'src/llm/ILLMService';
import Logger from '../../helpers/logger';
import crypto from 'crypto';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ModelMessageResponse } from 'src/schemas/ModelResponse';
import { Artifact } from 'src/tools/artifact';

/**
 * WebpageExecutor - Processes a single provided URL to:
 * - Scrape and summarize webpage content
 * - Follow and analyze relevant links within the page
 * - Track visited URLs to avoid duplicates
 * - Manage research artifacts and summaries
 * - Provide detailed reports with token usage tracking
 * 
 * Features:
 * - Configurable max follow links (MAX_FOLLOWS env var)
 * - PDF detection and filtering
 * - Intelligent link selection based on research context
 * - Token usage tracking and optimization
 * - Artifact management for persistence
 */
@StepExecutorDecorator('webpage', 'Processes and summarizes a single webpage')
export class WebpageExecutor implements StepExecutor {
    private scrapeHelper: ScrapeHelper;
    private llmService: ILLMService;
    private artifactManager: ArtifactManager;
    private modelHelpers: ModelHelpers;

    constructor(
        params: ExecutorConstructorParams & {
            modelHelpers: ModelHelpers;
        }
    ) {
        this.scrapeHelper = new ScrapeHelper(params.artifactManager, params.settings);
        this.llmService = params.llmService;
        this.artifactManager = params.artifactManager!;
        this.modelHelpers = params.modelHelpers!;
    }

    private visitedUrls: Set<string> = new Set();

    private async getScrapedUrls(): Promise<Set<string>> {
        const artifacts = await this.artifactManager.getArtifacts({ type: 'webpage' });
        return new Set(artifacts.map(a => a.metadata?.url));
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const { step, projectId, message, context } = params;
        
        try {
            // Extract URLs from params with context URLs as fallback
            const urls = await this.extractUrls(params);
            const contextUrls = context?.artifacts
                ?.filter(a => a.metadata?.url)
                .map(a => a.metadata.url) || [];

            const allUrls = [...new Set([...urls, ...contextUrls])];
            
            if (allUrls.length === 0) {
                return {
                    type: 'invalid_url',
                    finished: true,
                    response: {
                        message: `No valid URLs found in step: ${step}`
                    }
                };
            }

            // Process all URLs and collect artifacts
            const artifacts: Artifact[] = [];
            for (const url of allUrls) {
                try {
                    const artifact = await this.processPage(url, step || message || '', params.goal || params.overallGoal || '', projectId);
                    if (artifact) {
                        artifacts.push(artifact);
                    }
                } catch (error) {
                    Logger.error(`Error processing URL ${url}`, error);
                }
            }

            return {
                finished: true,
                type: 'webpage_summary',
                response: {
                    message: artifacts.length > 0 
                        ? artifacts.map(a => a.content).join('\n\n---\n\n')
                        : "I couldn't download any webpages.",
                    data: {
                        urls: allUrls,
                        artifactIds: artifacts.map(a => a.id)
                    },
                    _usage: {
                        inputTokens: 0,
                        outputTokens: artifacts.reduce((sum, a) => sum + (a.metadata?.tokenCount || 0), 0)
                    }
                }
            };
        } catch (error) {
            Logger.error(`Error processing webpage ${url}`, error);
            return {
                type: 'webpage_error',
                finished: true,
                response: {
                    message: `Error processing webpage ${url}: ${error}`
                }
            };
        }
    }

    private async extractUrls(params: ExecuteParams): Promise<string[]> {
        try {
            const sources = [
                params.message,
                params.step,
                ...(params.previousResult || []).map(r => r.message)
            ].filter(Boolean).join('\n');

            if (!sources) return [];

            const schema = {
                type: "object",
                properties: {
                    urls: {
                        type: "array",
                        items: {
                            type: "string",
                            format: "uri",
                            pattern: "^https?://"
                        },
                        description: "Array of URLs extracted from the text"
                    }
                },
                required: ["urls"]
            };
            
            const systemPrompt = `You are a URL extraction assistant. Analyze the following text and extract any URLs or website references that should be visited:
            - Include full URLs with https:// prefix
            - Convert domain names (test.com) to full URLs
            - Include any relevant paths
            - Preserve any URL parameters
            - Return empty array if no URLs found`;

            const instructions = new StructuredOutputPrompt(schema, systemPrompt);
            const response = await this.modelHelpers.generate<{ urls: string[] }>({
                message: sources,
                instructions
            });

            // Validate and normalize URLs
            const validUrls = (response.urls || [])
                .filter(url => {
                    try {
                        new URL(url);
                        return true;
                    } catch {
                        return false;
                    }
                })
                .map(url => {
                    const parsed = new URL(url);
                    // Ensure https protocol
                    parsed.protocol = 'https:';
                    return parsed.toString();
                });

            return validUrls;
        } catch (error) {
            Logger.error('Error extracting URLs', error);
            return [];
        }
    }

    private async processPage(url: string, step: string, goal: string, projectId: string): Promise<Artifact|null> {
        const scrapedUrls = await this.getScrapedUrls();
        let summaries: string[] = [];

        if (this.visitedUrls.has(url) || scrapedUrls.has(url)) {
            Logger.info(`Retrieving existing summary for URL: ${url}`);
            const existingSummaries = await this.artifactManager.getArtifacts({
                type: 'summary'
            });
            const existingSummary = existingSummaries.find(a =>
                a.metadata?.url === url
            );
            if (existingSummary) {
                return existingSummary;
            }
            Logger.info(`No existing summary found for URL, re-processing...: ${url}`);
        }
        this.visitedUrls.add(url);

        const { content, links, title } = await this.scrapeHelper.scrapePage(url, {
            task: step,
            projectId
        });

        // Generate and save summary with token tracking
        const summaryResponse = await this.summarizeContent(
            step,
            `Page Title: ${title}\nURL: ${url}\n\n${content}`,
            this.llmService
        );
        summaries.push(summaryResponse.message);

        if (summaryResponse.message !== "NOT RELEVANT") {
            const artifact = await this.artifactManager.saveArtifact({
                id: crypto.randomUUID(),
                type: 'summary',
                content: summaryResponse.message,
                metadata: {
                    title: `Summary Report for ${title}`,
                    url,
                    task: step,
                    projectId,
                    tokenUsage: summaryResponse._usage
                },
                tokenCount: summaryResponse._usage?.outputTokens
            });
            return artifact;
        } else {
            return null;
        }
    }

    async summarizeContent(task: string, content: string, llmService: ILLMService): Promise<ModelMessageResponse> {
        const schema = {
            type: "object",
            properties: {
                summary: {
                    type: "string",
                    description: "Markdown formatted summary of relevant content"
                },
                relevance: {
                    type: "string",
                    enum: ["relevant", "not_relevant"],
                    description: "Whether the content is relevant to the task"
                }
            },
            required: ["summary", "relevance"]
        };
        
        const systemPrompt = `You are a research assistant. The goal is to summarize a web page for the user's goal of: ${task}.
        Create a report in Markdown of all of the specific information from the provided web page that is relevant to our goal.
        If the page has no relevant information to the goal, respond with NOT RELEVANT.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const response = await this.modelHelpers.generate<{ summary: string, relevance: string }>({
            message: content,
            instructions
        });

        return {
            message: response.relevance === "not_relevant" ? "NOT RELEVANT" : response.summary,
            _usage: response._usage
        };
    }
}
