import { StepExecutor, StepResult, ExecutorConstructorParams } from '../stepBasedAgent';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import ScrapeHelper from '../../helpers/scrapeHelper';
import { ILLMService } from "src/llm/ILLMService";
import Logger from '../../helpers/logger';
import crypto from 'crypto';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ModelMessageResponse } from 'src/schemas/ModelResponse';

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
            scrapeHelper: ScrapeHelper;
            modelHelpers: ModelHelpers;
        }
    ) {
        this.scrapeHelper = params.scrapeHelper;
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
        const { step, projectId, message } = params;
        // Extract URL from step or message
        const url = this.extractUrl(params);
        if (!url) {
            return {
                type: 'invalid_url',
                finished: true,
                response: {
                    message: `No valid URL found in step: ${step}`
                }
            };
        }

        try {
            const summary = await this.processPage(url, step || message || '', params.goal || params.overallGoal || '', projectId);
            
            // Get artifacts to calculate total token usage
            const artifacts = await this.artifactManager.getArtifacts({
                type: 'summary',
                metadata: {
                    projectId,
                    task: step
                }
            });

            const totalTokens = artifacts.reduce((sum, artifact) =>
                sum + (artifact.metadata?.tokenUsage?.outputTokens || 0), 0
            );

            return {
                finished: true,
                type: 'webpage_summary',
                response: {
                    message: summary,
                    data: {
                        url,
                        artifactIds: artifacts.map(a => a.id)
                    },
                    _usage: {
                        inputTokens: 0, // We don't track input tokens for the overall process
                        outputTokens: totalTokens
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

    private extractUrl(params: ExecuteParams): string | null {
        try {
            // First check message and step directly
            const sources = [
                params.message,
                params.step,
                ...(params.previousResult || []).map(r => r.message)
            ];

            for (const source of sources) {
                if (!source) continue;
                
                // If source is already a valid URL
                if (source.startsWith('http://') || source.startsWith('https://')) {
                    return source;
                }
                
                // Try to extract URL from text
                const urlPattern = /https?:\/\/[^\s]+/;
                const match = source.match(urlPattern);
                if (match) {
                    return match[0];
                }
            }
            return null;
        } catch (error) {
            Logger.error('Error extracting URL', error);
            return null;
        }
    }

    private async processPage(url: string, step: string, goal: string, projectId: string): Promise<string> {
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
                return existingSummary.content.toString();
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
            await this.artifactManager.saveArtifact({
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
        }

        return summaries.join("\n\n");
    }

    async summarizeContent(task: string, content: string, llmService: ILLMService): Promise<ModelMessageResponse> {
        const systemPrompt = `You are a research assistant. The goal is to summarize a web page for the user's goal of: ${task}.
        Create a report in Markdown of all of the specific information from the provided web page that is relevant to our goal.
        If the page has no relevant information to the goal, respond with NOT RELEVANT.`;

        const userPrompt = "Web Page Content:" + content;
        const summary = await llmService.generate(systemPrompt, { message: userPrompt });

        // Strip markdown wrappers if present
        if (summary.message && summary.message.startsWith('```') && summary.message.endsWith('```')) {
            summary.message = summary.message.slice(3, -3);
        }

        return summary;
    }
}
