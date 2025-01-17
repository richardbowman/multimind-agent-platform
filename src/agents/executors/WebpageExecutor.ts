import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import ScrapeHelper from '../../helpers/scrapeHelper';
import { ILLMService } from "src/llm/ILLMService";
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
            // Extract URL from step or message
            // Check context artifacts first for URLs
            const contextUrls = context?.artifacts
                ?.filter(a => a.metadata?.url)
                .map(a => a.metadata.url) || [];
            
            // Extract URL from params with context URLs as fallback
            const url = this.extractUrl(params) || 
                contextUrls.find(u => u.includes(step) || u.includes(message || ''));
            if (!url) {
                return {
                    type: 'invalid_url',
                    finished: true,
                    response: {
                        message: `No valid URL found in step: ${step}`
                    }
                };
            }

            const artifact = await this.processPage(url, step || message || '', params.goal || params.overallGoal || '', projectId);

            return {
                finished: true,
                type: 'webpage_summary',
                response: {
                    message: artifact?.content || "I couldn't download this webpage.",
                    data: {
                        url,
                        artifactId: artifact?.id
                    },
                    _usage: {
                        inputTokens: 0,
                        outputTokens: artifact?.metadata?.tokenCount
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
                const urlPattern = /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+(?:\.[a-zA-Z]{2,})+(?:\/[^\s]*)?/;
                const match = source.match(urlPattern);
                if (match) {
                    let url = match[0];
                    // Add http:// prefix if missing
                    if (!url.startsWith('http')) {
                        url = `https://${url}`;
                    }
                    return url;
                }
            }
            return null;
        } catch (error) {
            Logger.error('Error extracting URL', error);
            return null;
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
