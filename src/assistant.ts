import LMStudioService from './llm/lmstudioService';
import Logger from "src/helpers/logger";
import JSON5 from 'json5';
import SearchHelper from './helpers/searchHelper';
import ScrapeHelper from './helpers/scrapeHelper';
import SummaryHelper from './helpers/summaryHelper';
import { RESEARCHER_TOKEN, CHAT_MODEL, CHROMA_COLLECTION, WEB_RESEARCH_CHANNEL_ID, MAX_SEARCHES, RESEARCHER_USER_ID, PROJECTS_CHANNEL_ID } from './config';
import { ChatClient, ChatPost } from './chat/chatClient';
import { Agent, HandleActivity, ResponseType } from './agents/agents';

class ResearchAssistant extends Agent {
    private tasks: { task: string, taskId: string }[] = []; // Store tasks with their unique IDs
    private results: string[] = [];
    private primaryGoal: string;
    private projectId: string;

    private searchHelper: SearchHelper;
    private scrapeHelper: ScrapeHelper;
    private summaryHelper: SummaryHelper;

    constructor(userToken: string, userId: string, chatClient: ChatClient, primaryGoal: string, lmStudioService: LMStudioService) {
        super(chatClient, lmStudioService, userId);

        this.lmStudioService = lmStudioService;
        this.chatClient = chatClient;
        this.primaryGoal = primaryGoal;
        this.userId = userId;

        this.searchHelper = new SearchHelper();
        this.scrapeHelper = new ScrapeHelper();
        this.summaryHelper = new SummaryHelper();
    }
    
    public async initialize(): Promise<void> {
        Logger.info(`Initialized Research Assistant ${RESEARCHER_TOKEN}`);
        await this.chromaDBService.initializeCollection(CHROMA_COLLECTION);
        super.setupChatMonitor(WEB_RESEARCH_CHANNEL_ID);
    }

    @HandleActivity("process-research-request", "Process research request list", ResponseType.CHANNEL)
    private async handleAssistantMessage(channelId: string, post: ChatPost): Promise<void> {
        // Process the incoming message from the assistant
        const projectId = post.props['project-id'];
        const activityType = post.props['activity-type'];

        if (!projectId || !activityType) {
            Logger.error('Invalid message received. Missing project ID or activity type.');
            return;
        }

        // Grab any new tasks from the message
        this.projectId = projectId; //TODO: this doesn't make sense to make global
        this.tasks = this.promptBuilder.parseMarkdownList(post.message).map(parsedTask => ({ task: parsedTask, taskId: "" }));

        // Continue conversation
        await this.performSearchAndScrape();

        await this.chatClient.createPost(PROJECTS_CHANNEL_ID, 
            `Research team completed the search and scraping for project ${projectId} to help accomplish: ${post.message}.`,
            {
                'project-id': projectId
            }
        );
    }

    private formatTaskMessage(taskId: string, message: string): string {
        return `${message}\n\n### Project ID: **${this.projectId}**\n\n### Task ID: **${taskId}**`;
    }
    
    public receiveTask(task: string, taskId: string) {
        // Assign a unique ID to each task
        this.tasks.push({ task, taskId });
    }

    async publishResult(channelId: string, taskId: string, result: string): Promise<void> {
        const message = this.formatTaskMessage(taskId, result);
        await this.chatClient.createPost(channelId, message);
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

        await this.chatClient.createPost(channelId, message);
    }

    async publishChildLinks(channelId: string, taskId: string, parentUrl: string, childLinks: { href: string }[], selectedLinks: { href: string }[]): Promise<void> {
        // Format the child links and highlight selected links in bold
        const formattedChildLinks = childLinks.map(cl => {
            let url = cl.href;

            if (selectedLinks.some(sl => sl.href === url)) {
                url = `**${url}**`;
            }

            return ` - ${url}\n`;
        }).join('');

        const message = this.formatTaskMessage(taskId, `Parent URL: **${parentUrl}**\n\nChild Links:\n${formattedChildLinks}`);

        try {
            await this.chatClient.createPost(channelId, message);
        } catch (error) {
            Logger.error("Couldn't create post.", error);
        }
    }

    async searchDoc(url: string, query: string, limit = 3): Promise<any> {
        try {
            return await this.chromaDBService.query([query], { "url": { "$eq": url } }, limit);
        } catch (error) {
            Logger.error('Error searching documents:', error);
            throw error;
        }
    }

    async performSearchAndScrape() {
        for (const { task, taskId } of this.tasks) {
            try {
                await this.handleTask(task, taskId);
            } catch (error) {
                Logger.error(`Error processing task "${task}":`, error);
            }
        }
    }

    private async handleTask(task: string, taskId: string) {
        const { searchQuery, category } = await this.generateSearchQuery(task);
        Logger.info(`Performing search for: ${searchQuery}`);

        const searchResults = await this.searchHelper.searchOnSearXNG(searchQuery, category);
        Logger.info(`Search Results Count: ${searchResults.length}`);

        if (searchResults.length === 0) {
            Logger.warn(`No results found for: ${task}`);
            return;
        }

        const selectedUrls = await this.selectRelevantSearchResults(task, searchResults);
        if (selectedUrls.length === 0) {
            Logger.warn(`No relevant URLs selected for: ${task}`);
            return;
        }

        await this.publishSelectedUrls(WEB_RESEARCH_CHANNEL_ID, taskId, searchQuery, searchResults, selectedUrls);

        const pageSummaries : string[] = [];

        for (let searchUrl of selectedUrls) {
            try {
                await this.processPage(taskId, task, searchUrl, pageSummaries);
            } catch (error) {
                Logger.error(`Error processing page ${searchUrl}.`, error);
            }
        }

        if (pageSummaries.length > 0) {
            const overallSummary = await this.createOverallSummary(task, pageSummaries);
            await this.publishResult(WEB_RESEARCH_CHANNEL_ID, taskId, `Summary for task ${task}: ${overallSummary}`);
            this.results.push(overallSummary);
        }
    }

    private async generateSearchQuery(task: string): Promise<{ searchQuery: string, category: string}> {
        const systemPrompt = `You are a research assistant. Our overall goal is ${this.primaryGoal}.
Generate a broad web search query without special keywords or operators based on the task we've been asked to research.
Respond ONLY with the JSON specified. You can perform a news search by setting the category to "news". Otherwise, specify "general":

{
  "searchQuery": "YOUR_SEARCH_QUERY",
  "category": "general" | "news"
}
`;


        const history = [
            { role: "system", content: systemPrompt },
        ];

        const userPrompt = `Task: ${task}`;

        let llmResponse = await this.lmStudioService.sendMessageToLLM(userPrompt, history, "{");
        const response : { searchQuery: string, category: string} = JSON5.parse(llmResponse);

        return response;
    }

    private async selectRelevantSearchResults(task: string, searchResults: { title: string, url: string, description: string }[]): Promise<string[]> {
        const systemPrompt = `You are a research assistant. Our overall goal was ${this.primaryGoal}, and we're currently working on researching ${task}.
Given the following web search results, select 1 to ${MAX_SEARCHES} URLs that are most relevant to our goal. Don't pick PDFs, we can't scrape them.
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

        (selectedUrlsJson);
        return JSON5.parse(selectedUrlsJson);
    }

    private async processPage(taskId: string, task: string, searchUrl: string, pageSummaries: any[]) {
        const visitedUrls = new Set<string>();
        visitedUrls.add(searchUrl);

        const { content, links, title } = await this.scrapeHelper.scrapePageWithPuppeteer(searchUrl);

        await this.publishChildLinks(WEB_RESEARCH_CHANNEL_ID, taskId, searchUrl, links, []);

        // save the full website
        await this.chromaDBService.handleContentChunks(content, searchUrl, task, this.projectId, this.primaryGoal, title);

        const selectedLinks = await this.selectRelevantLinks(task, content, links);
        await this.publishChildLinks(WEB_RESEARCH_CHANNEL_ID, taskId, searchUrl, links, selectedLinks);

        if (selectedLinks.length > 0) {
            Logger.info(`Following selected links: ${selectedLinks.map(l => l.href).join(', ')}`);
            for (const link of selectedLinks) {
                try {
                    const normalizedUrl = this.scrapeHelper.normalizeUrl(searchUrl, link.href);
                    visitedUrls.add(normalizedUrl);

                    const { content:followContent, links:followLinks, title:followTitle } = await this.scrapeHelper.scrapePageWithPuppeteer(normalizedUrl);
                    await this.chromaDBService.handleContentChunks(followContent, normalizedUrl, task, this.projectId, this.primaryGoal, followTitle);
                } catch (error) {
                    Logger.error(`Error summarizing followed page ${link.href}`, error);
                }
            }
        }

        // save summary(s)
        const results = await this.searchDoc(searchUrl, task);
        const summary = await this.summaryHelper.summarizeContent(task, results.documents.join("\n\n"), this.lmStudioService);
        pageSummaries.push(summary);

        await this.chromaDBService.handleContentChunks(summary, searchUrl, task, this.projectId, this.primaryGoal, `Summary Report for ${searchUrl}`, "summary");

        await this.publishResult(WEB_RESEARCH_CHANNEL_ID, taskId, `Summary of ${searchUrl}: ${summary}`);
    }

    private async createOverallSummary(task: string, pageSummaries: any[]): Promise<string> {
        return await this.summaryHelper.createOverallSummary(this.primaryGoal, task, pageSummaries, this.lmStudioService);
    }

    async selectRelevantLinks(task: string, content: string, links: { href: string, text: string }[]): Promise<{ href: string, text: string }[]> {
        try {
            const systemPrompt = `You are a research assistant. Our overall goal was ${this.primaryGoal}, and we're currently working on researching ${task}.
Given the content of a page and a list of internal links, select up to ${process.env.MAX_FOLLOWS} URLs that are most relevant to our goal. Don't pick PDFs, we can't scrape them.
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

            return JSON5.parse(selectedLinksJson);
        } catch (error) {
            Logger.error('Error selecting relevant links:', error);
            throw error;
        }
    }

    getResults(): string[] {
        return this.results;
    }
}

export default ResearchAssistant;