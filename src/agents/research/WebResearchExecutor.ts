import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import SearchHelper from '../../helpers/searchHelper';
import ScrapeHelper from '../../helpers/scrapeHelper';
import SummaryHelper from '../../helpers/summaryHelper';
import LMStudioService, { StructuredOutputPrompt } from '../../llm/lmstudioService';
import Logger from '../../helpers/logger';
import { ArtifactManager } from '../../tools/artifact';
import crypto from 'crypto';
import { ModelHelpers } from 'src/llm/helpers';

@StepExecutorDecorator('web_search', 'Performs web searches and summarizes results')
export class WebSearchExecutor implements StepExecutor {
    constructor(
        private searchHelper: SearchHelper,
        private scrapeHelper: ScrapeHelper,
        private summaryHelper: SummaryHelper,
        private lmStudioService: LMStudioService,
        private artifactManager: ArtifactManager,
        private modelHelpers: ModelHelpers
    ) {}

    private visitedUrls: Set<string> = new Set();

    private async getScrapedUrls(): Promise<Set<string>> {
        const artifacts = await this.artifactManager.getArtifacts({ type: 'webpage' });
        return new Set(artifacts.map(a => a.metadata?.url));
    }

    private async processPage(url: string, step: string, goal: string, projectId: string): Promise<string> {
        const scrapedUrls = await this.getScrapedUrls();
        
        if (this.visitedUrls.has(url) || scrapedUrls.has(url)) {
            Logger.info(`Skipping already processed URL: ${url}`);
            return "";
        }
        this.visitedUrls.add(url);
    
        const { content, links, title } = await this.scrapeHelper.scrapePage(url);
    
        // Save the full webpage content
        await this.artifactManager.saveArtifact({
            id: crypto.randomUUID(),
            type: 'webpage',
            content,
            metadata: {
                title,
                url,
                task: step,
                projectId
            }
        });
    
        const selectedLinks = await this.selectRelevantLinks(step, goal, title, links);
    
        if (selectedLinks.length > 0) {
            Logger.info(`Following selected links: ${selectedLinks.map(l => l.href).join(', ')}`);
            for (const link of selectedLinks) {
                try {
                    const normalizedUrl = this.scrapeHelper.normalizeUrl(url, link.href);
    
                    if (!this.visitedUrls.has(normalizedUrl) && !scrapedUrls.has(normalizedUrl)) {
                        this.visitedUrls.add(normalizedUrl);
    
                        const { content: followContent, title: followTitle } = await this.scrapeHelper.scrapePage(normalizedUrl);
                        
                        await this.artifactManager.saveArtifact({
                            id: crypto.randomUUID(),
                            type: 'webpage',
                            content: followContent,
                            metadata: {
                                title: followTitle,
                                url: normalizedUrl,
                                task: step,
                                projectId
                            }
                        });
                    }
                } catch (error) {
                    Logger.error(`Error processing followed page ${link.href}`, error);
                }
            }
        }
    
        // Generate and save summary
        const summary = await this.summaryHelper.summarizeContent(
            step,
            `Page Title: ${title}\nURL: ${url}\n\n${content}`,
            this.lmStudioService
        );

        if (summary !== "NOT RELEVANT") {
            await this.artifactManager.saveArtifact({
                id: crypto.randomUUID(),
                type: 'summary',
                content: summary,
                metadata: {
                    title: `Summary Report for ${url}`,
                    url,
                    task: step,
                    projectId
                }
            });
            return summary;
        }
        return "";
    }

    private async selectRelevantLinks(
        task: string,
        goal: string,
        title: string,
        links: { href: string, text: string }[]
    ): Promise<{ href: string, text: string }[]> {
        const MAX_FOLLOWS = parseInt(process.env.MAX_FOLLOWS || "0");
        
        if (MAX_FOLLOWS === 0) {
            return [];
        }

        const schema = {
            type: "array",
            items: {
                type: "object",
                properties: {
                    href: { type: "string" },
                    text: { type: "string" }
                },
                required: ["href"]
            }
        };

        const systemPrompt = `You are a research assistant. Our overall goal is ${goal}, and we're currently working on researching ${task}. 
Given a list of links from the page entitled "${title}", decide IF there are any relevant links on the page.
You can select up to ${MAX_FOLLOWS} URLs that are most relevant to our goal but should only pick links that will help solve the original goal and task. Don't pick PDFs, we can't scrape them.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const message = links.slice(0, 30)
            .map((l, i) => `${i + 1}. URL: ${l.href}\nText: ${l.text}`)
            .join("\n\n");

        return await this.modelHelpers.generate({
            message,
            instructions
        });
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const { searchQuery, category } = await this.generateSearchQuery(goal, step, previousResult);
        const searchResults = await this.searchHelper.searchOnSearXNG(searchQuery, category);
        
        if (searchResults.length === 0) {
            return { type: 'no_results' };
        }

        const selectedUrls = await this.selectRelevantSearchResults(step, goal, searchResults, previousResult);
        if (selectedUrls.length === 0) {
            return { type: 'no_relevant_results' };
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

        return {
            type: 'web_search_results',
            summaries: pageSummaries,
            query: searchQuery,
            urls: selectedUrls
        };
    }

    private async generateSearchQuery(goal: string, task: string, previousResult?: any): Promise<{ searchQuery: string, category: string}> {
        const schema = {
            type: "object",
            properties: {
                searchQuery: {
                    type: "string",
                    description: "A broad web search query without special keywords or operators"
                },
                category: {
                    type: "string",
                    enum: ["general", "news"],
                    description: "The search category - use 'news' for current events, otherwise 'general'"
                }
            },
            required: ["searchQuery", "category"]
        };

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
        return await this.modelHelpers.generate({
            message: `Task: ${task}`,
            instructions
        });
    }

    private async selectRelevantSearchResults(
        task: string,
        goal: string,
        searchResults: { title: string, url: string, description: string }[],
        previousResult?: any
    ): Promise<string[]> {
        const schema = {
            type: "object",
            properties: {
                urls: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            href: { type: "string" }
                        },
                        required: ["href"]
                    }
                }
            },
            required: ["urls"]
        };

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

        const response = await this.modelHelpers.generate({
            message,
            instructions
        });

        return response.urls.map(r => r.href);
    }
}
