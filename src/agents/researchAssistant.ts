import LMStudioService, { StructuredOutputPrompt } from '../llm/lmstudioService';
import Logger from "src/helpers/logger";
import JSON5 from 'json5';
import SearchHelper from '../helpers/searchHelper';
import ScrapeHelper from '../helpers/scrapeHelper';
import SummaryHelper from '../helpers/summaryHelper';
import { RESEARCHER_TOKEN, CHAT_MODEL, CHROMA_COLLECTION, WEB_RESEARCH_CHANNEL_ID, MAX_SEARCHES, RESEARCHER_USER_ID, PROJECTS_CHANNEL_ID } from '../helpers/config';
import { ChatClient, ChatPost } from '../chat/chatClient';
import { Agent, HandleActivity, ResponseType } from './agents';
import { Project, Task, TaskManager } from 'src/tools/taskManager';


export class ResearchTask implements Task {
    projectId: string;
    type: string;
    complete: boolean;
    description: string;
    id: string;
    creator: string;

    constructor(id: string, projectId: string, description: string, creator: string) {
        this.id = id;
        this.projectId = projectId;
        this.type = 'research';
        this.complete = false;
        this.description = description;
        this.creator = creator;
    }
}

export interface ResearchProject extends Project<ResearchTask> {
    postId: string;
}

class ResearchAssistant extends Agent<ResearchProject, ResearchTask> {
    private results: string[] = [];

    private searchHelper: SearchHelper;
    private scrapeHelper: ScrapeHelper;
    private summaryHelper: SummaryHelper;
    private isWorking: boolean = false;

    constructor(userToken: string, userId: string, chatClient: ChatClient, lmStudioService: LMStudioService, projects: TaskManager) {
        super(chatClient, lmStudioService, userId, projects);

        this.searchHelper = new SearchHelper();
        this.scrapeHelper = new ScrapeHelper();
        this.summaryHelper = new SummaryHelper();
    }
    
    public async initialize(): Promise<void> {
        Logger.info(`Initialized Research Assistant ${RESEARCHER_TOKEN}`);
        await this.chromaDBService.initializeCollection(CHROMA_COLLECTION);
        await super.setupChatMonitor(WEB_RESEARCH_CHANNEL_ID, "@researchteam");

        // asynchronously check for old tasks and keep working on them
        this.processTaskQueue();
    }
    
    protected async taskNotification(task: ResearchTask): Promise<void> {
        await this.processTask(task);
    }

    async processTaskQueue(): Promise<void> {
        const task : ResearchTask = await this.projects.getNextTaskForUser(this.userId);
        if (!task) {
            Logger.info("No more tasks for user.");
            return;
        }

        await this.processTask(task);
    }

    async processTask(task: ResearchTask) {
        try {
            if (this.isWorking) return;

            this.isWorking = true;
            Logger.info(`Notification for task ${task.id}: ${task.description}`);
            await this.scrapeUrl(task.projectId, task.description, task.description, task.id, []);
            await this.projects.completeTask(task.id);
        } catch (error) {
            Logger.error(`Error processing task "${task.task}":`, error);
        } finally {
            this.isWorking = false;
            // Recursively process the next task
            await this.processTaskQueue();
        }
    }

    protected projectCompleted(project: ResearchProject): void {
        Logger.info(`Project ${project.id} completed`);
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

        const primaryGoalMatch = post.message.match("Goal:\s*(.*?)(?=\n)");
        const tasks = this.promptBuilder.parseMarkdownList(post.message).map(parsedTask => ({ task: parsedTask, taskId: "" }));

        if (primaryGoalMatch?.length && primaryGoalMatch.length > 0 && tasks.length > 0) {
            const goal = primaryGoalMatch[1];

            await this.performSearchAndScrape(goal, projectId, tasks);

            await this.chatClient.createPost(PROJECTS_CHANNEL_ID, 
                `@research Research team completed the search and scraping for project ${projectId} to help accomplish: ${goal}.`,
                {
                    'project-id': projectId
                }
            );
        } else {
            Logger.error("No goal specified. Can't start research project");
        }
    }

    private formatTaskMessage(projectId: string, taskId: string, message: string): string {
        return `${message}\n\n### Project ID: **${projectId}**\n\n### Task ID: **${taskId}**`;
    }

    async publishResult(projectId: string, channelId: string, taskId: string, result: string): Promise<void> {
        const message = this.formatTaskMessage(projectId, taskId, result);
        await this.chatClient.createPost(channelId, message);
    }

    async publishSelectedUrls(projectId: string, channelId: string, taskId: string, searchQuery: string, searchResults: { title: string, url: string, description: string }[], selectedUrls: string[]): Promise<void> {
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

        const message = this.formatTaskMessage(projectId, taskId, `Search Query: **${searchQuery}**\n\nConsidered URLs:\n${formattedResults}`);

        await this.chatClient.createPost(channelId, message);
    }

    async publishChildLinks(projectId: string, channelId: string, taskId: string, parentUrl: string, childLinks: { href: string }[], selectedLinks: { href: string }[]): Promise<void> {
        // Format the child links and highlight selected links in bold
        const formattedChildLinks = childLinks.map(cl => {
            let url = cl.href;

            if (selectedLinks.some(sl => sl.href === url)) {
                url = `**${url}**`;
            }

            return ` - ${url}\n`;
        }).join('');

        const message = this.formatTaskMessage(projectId, taskId, `Parent URL: **${parentUrl}**\n\nChild Links:\n${formattedChildLinks}`);

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

    async performSearchAndScrape(goal: string, projectId: string, tasks: { task : string, taskId : string }[]): Promise<void> {
        const visitedUrls : string[] = [];
        for (const { task, taskId } of tasks) {
            try {
                await this.scrapeUrl(projectId, goal, task, taskId, visitedUrls);
            } catch (error) {
                Logger.error(`Error processing task "${task}":`, error);
            }
        }
    }

    private async scrapeUrl(projectId: string, goal: string, task: string, taskId: string, visitedUrls: string[]) {
        const { searchQuery, category } = await this.generateSearchQuery(goal, task);
        Logger.info(`Performing search for: ${searchQuery}`);

        const searchResults = await this.searchHelper.searchOnSearXNG(searchQuery, category);
        Logger.info(`Search Results Count: ${searchResults.length}`);

        if (searchResults.length === 0) {
            Logger.warn(`No results found for: ${task}`);
            return;
        }

        const selectedUrls = await this.selectRelevantSearchResults(task, goal, searchResults);
        if (selectedUrls.length === 0) {
            Logger.warn(`No relevant URLs selected for: ${task}`);
            return;
        }

        await this.publishSelectedUrls(projectId, WEB_RESEARCH_CHANNEL_ID, taskId, searchQuery, searchResults, selectedUrls);

        const pageSummaries : string[] = [];

        for (let searchUrl of selectedUrls) {
            try {
                const summary = await this.processPage(projectId, taskId, task, goal, searchUrl, pageSummaries, visitedUrls);
                await this.publishResult(projectId, WEB_RESEARCH_CHANNEL_ID, taskId, `Summary of ${searchUrl}: ${summary}`);
            } catch (error) {
                Logger.error(`Error processing page ${searchUrl}.`, error);
            }
        }

        if (pageSummaries.length > 0) {
            const overallSummary = await this.summaryHelper.createOverallSummary(goal, task, pageSummaries, this.lmStudioService);
            await this.publishResult(projectId, WEB_RESEARCH_CHANNEL_ID, taskId, `Summary for task ${task}: ${overallSummary}`);
            this.results.push(overallSummary);
        }
    }

    private async generateSearchQuery(goal: string, task: string): Promise<{ searchQuery: string, category: string}> {
        const systemPrompt = `You are a research assistant. Our overall goal is ${goal}.
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

    private async selectRelevantSearchResults(task: string, goal: string, searchResults: { title: string, url: string, description: string }[]): Promise<string[]> {
        const schema = {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "type": "object",
            "properties": {
              "urls": {
                "type": "array",
                "items": {
                  "type": "string",
                  "format": "uri"
                },
                "minItems": 1,
                "uniqueItems": true
              }
            },
            "required": ["urls"]
          };

        const systemPrompt = `You are a research assistant. Our overall goal was ${goal}, and we're currently working on researching ${task}.
Given the following web search results, select 1 to ${MAX_SEARCHES} URLs that are most relevant to our goal. Don't pick PDFs, we can't scrape them.
Return ONLY the selected URLs as a valid JSON array of strings like this:
{
  "urls": [
        "https://www.abc.com/about", 
        "https://www.xyz.com/result"
    ]
}
`;

        const history = [
            { role: "system", content: systemPrompt },
        ];

        const message = `Search Results:
${searchResults.slice(0, 8).map((sr, index) => `${index + 1}. Title: ${sr.title}\nURL: ${sr.url}\nDescription: ${sr.description.slice(0, 200)}`).join("\n\n")}`;

        const selectedUrlsJson = await this.lmStudioService.sendMessageToLLM(message, history, "", 8192, 8192, schema);

        return JSON5.parse(selectedUrlsJson).urls;
    }

    // returns summary
    private async processPage(projectId: string, taskId: string, task: string, goal: string, searchUrl: string, pageSummaries: any[], visitedUrls: string[]) : Promise<string> {
        if (visitedUrls.includes(searchUrl)) {
            Logger.info(`Skipping already processed URL: ${searchUrl}`);
            return "";
        }
        visitedUrls.push(searchUrl);

        const { content, links, title } = await this.scrapeHelper.scrapePage(searchUrl);

        await this.publishChildLinks(projectId, WEB_RESEARCH_CHANNEL_ID, taskId, searchUrl, links, []);

        // save the full website
        await this.chromaDBService.handleContentChunks(content, searchUrl, task, projectId, title);

        const selectedLinks = await this.selectRelevantLinks(task, goal, title, links);
        await this.publishChildLinks(projectId, WEB_RESEARCH_CHANNEL_ID, taskId, searchUrl, links, selectedLinks);

        if (selectedLinks.length > 0) {
            Logger.info(`Following selected links: ${selectedLinks.map(l => l.href).join(', ')}`);
            for (const link of selectedLinks) {
                try {
                    const normalizedUrl = this.scrapeHelper.normalizeUrl(searchUrl, link.href);

                    if (!visitedUrls.includes(normalizedUrl)) {
                        visitedUrls.push(normalizedUrl);

                        const { content:followContent, links:followLinks, title:followTitle } = await this.scrapeHelper.scrapePage(normalizedUrl);
                        await this.chromaDBService.handleContentChunks(followContent, normalizedUrl, task, projectId, followTitle, "webpage");
                    }
                } catch (error) {
                    Logger.error(`Error summarizing followed page ${link.href}`, error);
                }
            }
        }

        // save summary(s)
        const results = await this.searchDoc(searchUrl, task);
        const summary = await this.summaryHelper.summarizeContent(task, results.documents.join("\n\n"), this.lmStudioService);
        pageSummaries.push(summary);

        await this.chromaDBService.handleContentChunks(summary, searchUrl, task, projectId, `Summary Report for ${searchUrl}`, "summary");
        return summary;
    }

    async selectRelevantLinks(task: string, goal: string, title: string, links: { href: string, text: string }[]): Promise<{ href: string, text: string }[]> {
    const MAX_FOLLOWS = parseInt(process.env.MAX_FOLLOWS || "0");
    try {
        if (MAX_FOLLOWS === 0) {
            return [];
        }

        const systemPrompt = `You are a research assistant. Our overall goal is ${goal}, and we're currently working on researching ${task}. 
Given a list of links from the page entitled "${title}", decide IF there are any relevant links on the page.
You can select up to ${MAX_FOLLOWS} URLs that are most relevant to our goal but should only pick links that will help solve the original goal and task. Don't pick PDFs, we can't scrape them.
Return ONLY the selected URLs as a valid JSON array of objects like this:
[
    { "href": "https://www.abc.com/about-link" }, 
    { "href": "https://www.xyz.com/relevant-link" }
]
`;

        const schema = {
            type: "array",
            items: {
                type: "object",
                properties: {
                    href: {
                        type: "string"
                    },
                    text: {
                        type: "string"
                    }
                },
                required: ["href"]
            }
        };

        const history = [
            { role: "system", content: systemPrompt },
        ];

        const message = `${links.slice(0, 30).map((l, index) => `${index + 1}. URL: ${l.href}\nText: ${l.text}`).join("\n\n")}`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);

        const selectedLinks = await this.lmStudioService.sendStructuredRequest(message, instructions, history);
        return selectedLinks;
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