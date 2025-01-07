import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import SearchHelper, { DuckDuckGoProvider } from '../../helpers/searchHelper';
import ScrapeHelper from '../../helpers/scrapeHelper';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import Logger from '../../helpers/logger';
import crypto from 'crypto';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ModelMessageResponse } from 'src/schemas/ModelResponse';
import { WebSearchResponse } from '../../schemas/WebSearchResponse';
import { SearchQueryResponse } from '../../schemas/SearchQueryResponse';
import { LinkSelectionResponse } from '../../schemas/LinkSelectionResponse';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';

/**
 * WebSearchExecutor - An intelligent web research agent that:
 * - Generates contextual search queries based on research goals
 * - Performs web searches using configurable search providers
 * - Evaluates and filters search results for relevance
 * - Scrapes and summarizes webpage content
 * - Follows and analyzes relevant links within pages
 * - Tracks visited URLs to avoid duplicates
 * - Manages research artifacts and summaries
 * - Provides detailed research reports with token usage tracking
 * 
 * Features:
 * - Configurable max follow links (MAX_FOLLOWS env var)
 * - PDF detection and filtering
 * - Intelligent link selection based on research context
 * - Token usage tracking and optimization
 * - Structured output using JSON schemas
 * - Artifact management for persistence
 */
@StepExecutorDecorator('web_search', 'Performs web searches and summarizes results')
export class WebSearchExecutor implements StepExecutor {
    constructor(
        private searchHelper: SearchHelper = new SearchHelper(new DuckDuckGoProvider(this.artifactManager)),
        private scrapeHelper: ScrapeHelper,
        private llmService: ILLMService,
        private artifactManager: ArtifactManager,
        private modelHelpers: ModelHelpers
    ) { }

    private visitedUrls: Set<string> = new Set();

    private async getScrapedUrls(): Promise<Set<string>> {
        const artifacts = await this.artifactManager.getArtifacts({ type: 'webpage' });
        return new Set(artifacts.map(a => a.metadata?.url));
    }

    private async processPage(url: string, step: string, goal: string, projectId: string): Promise<string> {
        const scrapedUrls = await this.getScrapedUrls();
        let summaries : string[] = [];

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

        const selectedLinks = await this.selectRelevantLinks(step, goal, title, links);

        if (selectedLinks.length > 0) {
            Logger.info(`Following selected links: ${selectedLinks.map(l => l.href).join(', ')}`);
            for (const link of selectedLinks) {
                try {
                    const normalizedUrl = this.scrapeHelper.normalizeUrl(url, link.href);

                    if (!this.visitedUrls.has(normalizedUrl) && !scrapedUrls.has(normalizedUrl)) {
                        this.visitedUrls.add(normalizedUrl);

                        const { content: followContent, title: followTitle } = await this.scrapeHelper.scrapePage(normalizedUrl, {
                            task: step,
                            projectId
                        });

                        // Generate and save summary with token tracking
                        const followupSummaryResponse = await this.summarizeContent(
                            step,
                            `Page Title: ${followTitle}\nURL: ${normalizedUrl}\n\n${followContent}`,
                            this.llmService
                        );
                        if (followupSummaryResponse.message !== "NOT RELEVANT") {
                            summaries
                            await this.artifactManager.saveArtifact({
                                id: crypto.randomUUID(),
                                type: 'summary',
                                content: followupSummaryResponse.message,
                                metadata: {
                                    title: `Summary Report for ${followTitle}`,
                                    url: normalizedUrl,
                                    task: step,
                                    projectId,
                                    tokenUsage: followupSummaryResponse._usage
                                },
                                tokenCount: followupSummaryResponse._usage?.outputTokens
                            });
                
                        }
                        summaries.push(followupSummaryResponse.message);

                    }
                } catch (error) {
                    Logger.error(`Error processing followed page ${link.href}`, error);
                }
            }
        }

        if (summaryResponse.message !== "NOT RELEVANT") {
            summaries
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

    private async selectRelevantLinks(
        task: string,
        goal: string,
        title: string,
        links: { href: string, text: string }[]
    ): Promise<LinkSelectionResponse['links']> {
        const MAX_FOLLOWS = parseInt(process.env.MAX_FOLLOWS || "0");

        if (MAX_FOLLOWS === 0) {
            return [];
        }

        // Filter out already scraped URLs
        const scrapedUrls = await this.getScrapedUrls();
        const newLinks = links.filter(link => {
            const normalizedUrl = link.href;
            return !scrapedUrls.has(normalizedUrl) && !this.visitedUrls.has(normalizedUrl);
        });

        if (newLinks.length === 0) {
            return [];
        }

        const schema = await getGeneratedSchema(SchemaType.LinkSelectionResponse);

        const systemPrompt = `You are a research assistant. Our overall goal is ${goal}, and we're currently working on researching ${task}. 
Given a list of links from the page entitled "${title}", decide IF there are any relevant links on the page.
You can select up to ${MAX_FOLLOWS} URLs that are most relevant to our goal but should only pick links that will help solve the original goal and task. Don't pick PDFs, we can't scrape them.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const message = links.slice(0, 30)
            .map((l, i) => `${i + 1}. URL: ${l.href}\nText: ${l.text}`)
            .join("\n\n");

        const response = await this.modelHelpers.generate<LinkSelectionResponse>({
            message,
            instructions
        });

        return response.links || [];
    }

    async executeOld(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const { searchQuery, category } = await this.generateSearchQuery(goal, step, previousResult);
        const searchResults = await this.searchHelper.search(searchQuery, category);

        if (searchResults.length === 0) {
            return {
                type: 'no_results', finished: true, response: {
                    message: `No search results found for ${goal}: ${step}`
                }
            };
        }

        const selectedUrls = await this.selectRelevantSearchResults(step, goal, searchResults, previousResult);
        if (selectedUrls.length === 0) {
            return {
                type: 'no_relevant_results', finished: true, response: {
                    message: `Selected zero links. No relervant search results found for ${goal}: ${step}`
                }
            };
        }

        const pageSummaries: string[] = [];
        for (const url of selectedUrls.slice(0, 2)) {
            try {
                const summary = await this.processPage(url, step, goal, projectId);
                if (summary) {
                    pageSummaries.push(summary);
                }
            } catch (error) {
                Logger.error(`Error processing page ${url}`, error);
            }
        }

        // Get artifacts to calculate total token usage
        const artifacts = await this.artifactManager.getArtifacts({
            type: 'summary'
        });
        const relevantArtifacts = artifacts.filter(a =>
            a.metadata?.projectId === projectId &&
            a.metadata?.task === step
        );

        const totalTokens = relevantArtifacts.reduce((sum, artifact) =>
            sum + (artifact.metadata?.tokenUsage?.outputTokens || 0), 0
        );

        // Create a detailed message summarizing the findings
        const summaryMessage = [
            `## Web Research Results`,
            `\nSearch Query: "${searchQuery}"`,
            `\nFound ${pageSummaries.length} relevant pages out of ${searchResults.length} search results.`,
            `\n### Analyzed URLs:`,
            ...selectedUrls.map(url => `- ${url}`),
            `\n### Key Findings:`,
            ...pageSummaries.map((summary, index) => `\n#### Source ${index + 1}:\n${summary}`),
            `\n### Usage Statistics:`,
            `- Total Output Tokens: ${totalTokens}`,
            `- Artifacts Generated: ${relevantArtifacts.length}`
        ].join('\n');

        return {
            finished: true,
            type: 'web_search_results',
            response: {
                message: summaryMessage,
                data: {
                    summaries: pageSummaries,
                    query: searchQuery,
                    urls: selectedUrls,
                    artifactIds: relevantArtifacts.map(a => a.id)
                },
                _usage: {
                    inputTokens: 0, // We don't track input tokens for the overall process
                    outputTokens: totalTokens
                }
            }
        };
    }

    private async generateSearchQuery(goal: string, task: string, previousResult?: any): Promise<SearchQueryResponse> {
        const schema = await getGeneratedSchema(SchemaType.SearchQueryResponse);

        const previousFindings = previousResult?.data?.analysis?.keyFindings || [];
        const previousGaps = previousResult?.data?.analysis?.gaps || [];

        const systemPrompt = `You are a research assistant. Our overall goal is ${goal}.
Consider these specific goals we're trying to achieve: ${task}

Previous Research Findings:
${previousFindings.map((f: any) => `- ${f.finding}`).join('\n')}

Identified Gaps:
${previousGaps.map((g: string) => `- ${g}`).join('\n')}

Generate a broad web search query without special keywords or operators based on the task and previous findings.
Focus on filling knowledge gaps and expanding on existing findings.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const response = await this.modelHelpers.generate<SearchQueryResponse>({
            message: `Task: ${task}`,
            instructions
        });

        return response;
    }

    private async selectRelevantSearchResults(
        task: string,
        goal: string,
        searchResults: { title: string, url: string, description: string }[],
        previousResult?: any
    ): Promise<string[]> {
        const schema = await getGeneratedSchema(SchemaType.WebSearchResponse);

        const previousFindings = previousResult?.data?.analysis?.keyFindings || [];

        const systemPrompt = `You are a research assistant. Our overall goal is ${goal}, and we're currently working on researching ${task}.

Previous Research Findings:
${previousFindings.map((f: any) => `- ${f.finding}`).join('\n')}

Given the following web search results, select 1-3 URLs that are most relevant to our goal and would help expand our knowledge beyond what we already know. Don't pick PDFs, we can't scrape them.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const message = searchResults
            .slice(0, 8)
            .map((sr, i) => `${i + 1}. Title: ${sr.title}\nURL: ${sr.url}\nDescription: ${sr.description.slice(0, 200)}`)
            .join("\n\n");

        const response = await this.modelHelpers.generate<WebSearchResponse>({
            message,
            instructions
        });

        // Handle potential malformed responses
        if (!response.urls || !Array.isArray(response.urls)) {
            Logger.warn('Received malformed URL response from LLM', response);
            return [];
        }

        return response.urls.filter(url => typeof url === 'string');
    }

    async summarizeContent(task: string, content: string, llmService: ILLMService): Promise<ModelMessageResponse> {
        const systemPrompt = `You are a research assistant. The goal is to summarize a web search result for the user's goal of: ${task}.
        Create a report in Markdown of all of the specific information from the provided web page that is relevant to our goal.
        If the page has no relevant information to the goal, respond with NOT RELEVANT.`;

        const userPrompt = "Web Search Result:" + content;
        const summary = await llmService.generate(systemPrompt, { message: userPrompt });

        return summary;
    }
}
