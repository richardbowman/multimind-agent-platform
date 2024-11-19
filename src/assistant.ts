import LMStudioService from './lmstudioService';
import MattermostClient from './mattermostClient';
import ChromaDBService from './chromaService';
import JSON5 from 'json5';
import SearchHelper from './searchHelper';
import ScrapeHelper from './scrapeHelper';
import SummaryHelper from './summaryHelper';
import { RESEARCHER_TOKEN, CHAT_MODEL, CHROMA_COLLECTION, WEB_RESEARCH_CHANNEL_ID, MAX_SEARCHES, RESEARCHER_USER_ID } from './config';
import { URL } from 'url';

function normalizeUrl(baseUrl: string, childUrl: string): string {
    try {
        return new URL(childUrl, baseUrl).href;
    } catch (error) {
        console.error(`Error normalizing URL "${childUrl}" with base "${baseUrl}":`, error);
        throw error;
    }
}

class ResearchAssistant {
    private tasks: { task: string, taskId: string }[] = []; // Store tasks with their unique IDs
    private results: string[] = [];
    private chromaDBService: ChromaDBService;
    private lmStudioService: LMStudioService;
    private mattermostClient: MattermostClient;
    private primaryGoal: string;
    private projectId: string;

    private searchHelper: SearchHelper;
    private scrapeHelper: ScrapeHelper;
    private summaryHelper: SummaryHelper;

    constructor(projectId: string, primaryGoal: string) {
        this.chromaDBService = new ChromaDBService();
        this.lmStudioService = new LMStudioService();
        this.mattermostClient = new MattermostClient(RESEARCHER_TOKEN, RESEARCHER_USER_ID);
        this.primaryGoal = primaryGoal;
        this.projectId = projectId;

        this.searchHelper = new SearchHelper();
        this.scrapeHelper = new ScrapeHelper();
        this.summaryHelper = new SummaryHelper();
    }

    async initialize(): Promise<void> {
        try {
            await this.lmStudioService.initializeLlamaModel(CHAT_MODEL);
            await this.chromaDBService.initializeCollection(CHROMA_COLLECTION);
        } catch (error) {
            console.error('Error initializing LMStudio and ChromaDB:', error);
            throw error;
        }
    }
    
    private formatTaskMessage(taskId: string, message: string): string {
        return `${message}\n\n### Project ID: **${this.projectId}**\n\n### Task ID: **${taskId}**`;
    }
    
    receiveTask(task: string, taskId: string) {
        // Assign a unique ID to each task
        this.tasks.push({ task, taskId });
    }

    async publishResult(channelId: string, taskId: string, result: string): Promise<void> {
        const message = this.formatTaskMessage(taskId, result);
        await this.mattermostClient.createPost(channelId, message);
    }

    async publishSelectedUrls(channelId: string, taskId: string, searchQuery: string, searchResults: { title: string, url: string, description: string }[], selectedUrls: string[]): Promise<void> {
        // Format the search results and highlight selected URLs in bold
        const formattedResults = searchResults.map(sr => {
            let title = sr.title;
            let url = sr.url;

            if (selectedUrls.includes(url)) {
                title = `**${title}**`;
                url = `**${url}**`;
            }

            return `Title: ${title}\nURL: ${url}\nDescription: ${sr.description.slice(0, 200)}\n\n`;
        }).join('');

        const message = this.formatTaskMessage(taskId, `Search Query: **${searchQuery}**\n\nConsidered URLs:\n${formattedResults}`);

        await this.mattermostClient.createPost(channelId, message);
    }

    async publishChildLinks(channelId: string, taskId: string, parentUrl: string, childLinks: { href: string }[], selectedLinks: { href: string }[]): Promise<void> {
        // Format the child links and highlight selected links in bold
        const formattedChildLinks = childLinks.map(cl => {
            let url = cl.href;

            if (selectedLinks.some(sl => sl.href === url)) {
                url = `**${url}**`;
            }

            return ` - ${url}\n\n`;
        }).join('');

        const message = this.formatTaskMessage(taskId, `Parent URL: **${parentUrl}**\n\nChild Links:\n${formattedChildLinks}`);

        await this.mattermostClient.createPost(channelId, message);
    }

    async searchDoc(url: string, query: string, limit = 3): Promise<any> {
        try {
            return await this.chromaDBService.query([query], { "url": { "$eq": url } }, limit);
        } catch (error) {
            console.error('Error searching documents:', error);
            throw error;
        }
    }


    async performSearchAndScrape() {
        for (const { task, taskId } of this.tasks) {
            try {
                const searchQuery = await this.generateOptimizedSearchQuery(task);
                console.log(`Performing search for: ${searchQuery}`);
                const searchResults = await this.searchHelper.searchOnSearXNG(searchQuery);

                if (!Array.isArray(searchResults)) {
                    throw new Error(`Unexpected type of search results. Expected an array, but got: ${typeof searchResults}`);
                }

                console.log(`Search Results Count: ${searchResults.length}`);

                if (searchResults.length === 0) {
                    console.warn(`No results found for: ${task}`);
                    continue;
                }

                const selectedUrls = await this.selectRelevantSearchResults(task, searchResults);
                if (selectedUrls.length === 0) {
                    console.warn(`No relevant URLs selected for: ${task}`);
                    continue;
                }

                // Publish the list of selected URLs
                await this.publishSelectedUrls(WEB_RESEARCH_CHANNEL_ID, taskId, searchQuery, searchResults, selectedUrls);

                const pageSummaries = [];

                for (let searchUrl of selectedUrls) {
                    try {
                        const visitedUrls = new Set<string>();
                        visitedUrls.add(searchUrl);

                        const { content, links } = await this.scrapeHelper.scrapePageWithPuppeteer(searchUrl, visitedUrls);

                        // Publish the child links
                        await this.publishChildLinks(WEB_RESEARCH_CHANNEL_ID, taskId, searchUrl, links, []);

                        await this.chromaDBService.handleContentChunks(content, searchUrl, task, this.projectId, this.primaryGoal);

                        // Only select relevant links if there are any
                        if (links && links.length > 0) {
                            const selectedLinks = await this.selectRelevantLinks(task, content, links);

                            // Publish the selected child links
                            await this.publishChildLinks(WEB_RESEARCH_CHANNEL_ID, taskId, searchUrl, links, selectedLinks);

                            if (selectedLinks.length > 0) {
                                console.log(`Following selected links: ${selectedLinks.map(l => l.href).join(', ')}`);
                                for (const link of selectedLinks) {
                                    try {
                                        // Normalize the URL before scraping
                                        const normalizedUrl = normalizeUrl(searchUrl, link.href);
                                        visitedUrls.add(normalizedUrl);

                                        const followContent = await this.scrapeHelper.scrapePageWithPuppeteer(normalizedUrl, visitedUrls);
                                        await this.chromaDBService.handleContentChunks(followContent.content, normalizedUrl, task, this.projectId, this.primaryGoal);
                                    } catch (error) {
                                        console.error(`Error summarizing followed page ${link.href}:`, error);
                                    }
                                }
                            }
                        }

                        //TODO: don't like this part, we treat all of the scraped pages as a single group versus summarizing each one separately
                        const results = await this.searchDoc(searchUrl, task);
                        const summary = await this.summaryHelper.summarizeContent(task, results.documents.join("\n\n"), this.lmStudioService);
                        pageSummaries.push(summary);

                        await this.chromaDBService.handleContentChunks(summary, searchUrl, task, this.projectId, this.primaryGoal, 'summary');

                        await this.publishResult(WEB_RESEARCH_CHANNEL_ID, taskId, `Summary of ${searchUrl}: ${summary}`);
                    } catch (error) {
                        console.error(`Error summarizing page ${searchUrl}:`, error);
                    }
                }

                if (pageSummaries.length > 0) {
                    const overallSummary = await this.summaryHelper.createOverallSummary(this.primaryGoal, task, pageSummaries, this.lmStudioService);

                    await this.publishResult(WEB_RESEARCH_CHANNEL_ID, taskId, `Summary for task ${task}: ${overallSummary}`);

                    this.results.push(overallSummary);
                }
            } catch (error) {
                console.error(`Error processing task "${task}":`, error);
            }
        }
    }

    async selectRelevantLinks(task: string, content: string, links: { href: string, text: string }[]): Promise<{ href: string, text: string }[]> {
        try {
            const systemPrompt = `You are a research assistant. Our overall goal was ${this.primaryGoal}, and we're currently working on researching ${task}.
Given the content of a page and a list of internal links, select up to 3 URLs that are most relevant to our goal. Don't pick PDFs, we can't scrape them.
Return ONLY the selected URLs as a valid JSON array of objects like this:
[
    { "href": "https://www.google.com/search?q=hello", "text": "Hello World" }, 
    { "href": "https://www.google.com/search?q=world", "text": "World Hello" }
]
`;

            const history = [
                { role: "system", content: systemPrompt },
            ];

            //TODO: we should send in the LLM's summarization of this content
            const message = `Page Content:
${content.slice(0, 500)}

Links:
${links.slice(0, 30).map((l, index) => `${index + 1}. URL: ${l.href}\nText: ${l.text}`).join("\n\n")}`;

            const selectedLinksJson = await this.lmStudioService.sendMessageToLLM(message, history, "[");

            // console.log(selectedLinksJson);
            return JSON5.parse(selectedLinksJson);
        } catch (error) {
            console.error('Error selecting relevant links:', error);
            throw error;
        }
    }


    async generateOptimizedSearchQuery(task: string): Promise<string> {
        try {
            const systemPrompt = `You are a research assistant. Our overall goal is ${this.primaryGoal}.
Generate a broad web search query without special keywords or operators based on the task we've been asked to research. Respond ONLY with the search query to run.`;

            const history = [
                { role: "system", content: systemPrompt },
            ];

            const userPrompt = `Task: ${task}`;

            let optimizedQuery = await this.lmStudioService.sendMessageToLLM(userPrompt, history);

            // Remove leading and trailing quotes
            if (optimizedQuery.startsWith('"') && optimizedQuery.endsWith('"')) {
                optimizedQuery = optimizedQuery.slice(1, -1);
            }

            return optimizedQuery;
        } catch (error) {
            console.error('Error generating optimized search query:', error);
            throw error;
        }
    }

    async selectRelevantSearchResults(task: string, searchResults: { title: string, url: string, description: string }[]): Promise<string[]> {
        try {
            const systemPrompt = `You are a research assistant. Our overall goal was ${this.primaryGoal}, and we're currently working on researching ${task}.
Given the following web search results, select 1 - ${MAX_SEARCHES} URLs that are most relevant to our goal. Don't pick PDFs, we can't scrape them.
Return ONLY the selected URLs as a valid JSON array of strings like this:
[
    "https://www.google.com/search?q=hello", 
    "https://www.google.com/search?q=world"
]
`;

            const history = [
                { role: "system", content: systemPrompt },
            ];

            const message = `Search Results:
${searchResults.slice(0, 8).map((sr, index) => `${index + 1}. Title: ${sr.title}\nURL: ${sr.url}\nDescription: ${sr.description.slice(0, 200)}`).join("\n\n")}`;

            const selectedUrlsJson = await this.lmStudioService.sendMessageToLLM(message, history, "[");

            // console.log(selectedUrlsJson);
            return JSON5.parse(selectedUrlsJson);
        } catch (error) {
            console.error('Error selecting relevant search results:', error);
            throw error;
        }
    }

    getResults(): string[] {
        return this.results;
    }
}

export default ResearchAssistant;