import { StepBasedAgent } from './stepBasedAgent';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import { ChatClient, ChatPost } from '../chat/chatClient';
import LMStudioService from '../llm/lmstudioService';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { TaskManager } from '../tools/taskManager';
import { Project, Task } from '../tools/taskManager';
import { WebSearchExecutor } from './research/WebResearchExecutor';
import SearchHelper, { DuckDuckGoProvider } from '../helpers/searchHelper';
import ScrapeHelper from '../helpers/scrapeHelper';
import SummaryHelper from '../helpers/summaryHelper';
import Logger from '../helpers/logger';
import { CHROMA_COLLECTION, MAX_SEARCHES, RESEARCHER_TOKEN, WEB_RESEARCH_CHANNEL_ID } from '../helpers/config';
import { Artifact } from 'src/tools/artifact';
import { ModelMessageResponse, RequestArtifacts, CreateArtifact } from '../schemas/ModelResponse';
import ChromaDBService from 'src/llm/chromaService';
import { KnowledgeCheckExecutor } from './executors/checkKnowledgeExecutor';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { FinalResponseExecutor } from './executors/FinalResponseExecutor';


interface ResearchState {
    originalGoal: string;
    currentStep: string;
    intermediateResults: any[];
    needsUserInput?: boolean;
    userQuestion?: string;
    existingArtifacts?: { 
        id: string, 
        title: string,
        content: string,
        underlyingData: string
     }[]
}

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

class ResearchAssistant extends StepBasedAgent<ResearchProject, ResearchTask> {
    private searchHelper = new SearchHelper(new DuckDuckGoProvider(this.artifactManager));
    private scrapeHelper = new ScrapeHelper(this.artifactManager);
    private summaryHelper = new SummaryHelper();

    constructor(
        userToken: string, 
        userId: string, 
        chatClient: ChatClient, 
        llmService: LMStudioService, 
        taskManager: TaskManager,
        vectorDBService: ChromaDBService
    ) {
        super({chatClient, llmService, userId, taskManager, vectorDBService});
        this.modelHelpers.setPurpose("You are a research assisant who thoroughly summarizes web results.");
        this.modelHelpers.setFinalInstructions("PROPER PROCESS: do a 'check-knowledge' first, then a 'validation' step to see if you can meet the goals. If not, then add 'web_search' and 'validation' as needed until you get the answer. Make sure your final step is a `final_response`");

        // Register step executors
        this.registerStepExecutor(new WebSearchExecutor(
            this.searchHelper,
            this.scrapeHelper,
            this.summaryHelper,
            llmService,
            this.artifactManager,
            this.modelHelpers
        ));
        this.registerStepExecutor(new ValidationExecutor(llmService));
        this.registerStepExecutor(new KnowledgeCheckExecutor(
            llmService, vectorDBService
        ));
        this.registerStepExecutor(new FinalResponseExecutor(this.modelHelpers));
    }
    
    public async initialize(): Promise<void> {
        Logger.info(`Initialized Research Assistant ${RESEARCHER_TOKEN}`);
        await this.scrapeHelper.initialize();
        await super.setupChatMonitor(WEB_RESEARCH_CHANNEL_ID, "@researchteam");

        // asynchronously check for old tasks and keep working on them
        this.processTaskQueue();
    }

    async processTask(task: ResearchTask) {
        Logger.info(`Notification for task ${task.id}: ${task.description}`);
        await this.scrapeUrl(task.projectId, task.description, task.description, task.id, []);
        await this.projects.completeTask(task.id);
    }

    protected projectCompleted(project: ResearchProject): void {
        Logger.info(`Project ${project.id} completed`);
    }

    private formatTaskMessage(taskId: string, message: string): string {
        return `${message}\n\n### Task ID: **${taskId}**`;
    }

    async publishResult(channelId: string, taskId: string, result: string): Promise<void> {
        const message = this.formatTaskMessage(taskId, result);
        await this.chatClient.postInChannel(channelId, message);
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

            return `Title: ${title}\nURL: ${url}\nDescription: ${sr.description?.slice(0, 200)||"n/a"}\n\n`;
        }).join('');

        const message = this.formatTaskMessage(taskId, `Search Query: **${searchQuery}**\n\nConsidered URLs:\n${formattedResults}`);

        await this.chatClient.postInChannel(channelId, message);
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

        const message = this.formatTaskMessage(taskId, `Parent URL: **${parentUrl}**\n\nChild Links:\n${formattedChildLinks}`);

        try {
            await this.chatClient.postInChannel(channelId, message);
        } catch (error) {
            Logger.error("Couldn't create post.", error);
        }
    }

    async searchDoc(url: string, query: string, limit = 3): Promise<any> {
        try {
            return await this.chromaDBService.queryOld([query], { "url": { "$eq": url } }, limit);
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

        const searchResults = await this.searchHelper.search(searchQuery, category);
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
                await this.publishResult(WEB_RESEARCH_CHANNEL_ID, taskId, `Summary of ${searchUrl}: ${summary}`);
            } catch (error) {
                Logger.error(`Error processing page ${searchUrl}.`, error);
            }
        }

        if (pageSummaries.length > 0) {
            const overallSummary = await this.summaryHelper.createOverallSummary(goal, task, pageSummaries, this.llmService);
            await this.publishResult(WEB_RESEARCH_CHANNEL_ID, taskId, `Summary for task ${task}: ${overallSummary}`);
            this.results.push(overallSummary);
        }
    }

//     private async checkExistingKnowledge(goal: string): Promise<{
//         hasRelevantInfo: boolean;
//         existingArtifacts: Artifact[];
//         needsAdditionalResearch: boolean;
//         relevantFindings?: string;
//     }> {
//         const schema = {
//             type: "object",
//             properties: {
//                 hasRelevantInfo: {
//                     type: "boolean",
//                     description: "Whether relevant information was found in existing artifacts"
//                 },
//                 needsAdditionalResearch: {
//                     type: "boolean",
//                     description: "Whether additional research is needed beyond existing information"
//                 },
//                 relevantFindings: {
//                     type: "string",
//                     description: "Summary of relevant information found in existing artifacts"
//                 },
//                 relevantArtifactIds: {
//                     type: "array",
//                     description: "The id of each relevant artifact found in the query"
//                 }
//             },
//             required: ["hasRelevantInfo", "needsAdditionalResearch"]
//         };

//         // Query the vector store for relevant summaries
//         const results = await this.chromaDBService.query([goal], { "type": "summary" }, 5);
        
//         if (results.length === 0) {
//             return {
//                 hasRelevantInfo: false,
//                 existingArtifacts: [],
//                 needsAdditionalResearch: true
//             };
//         }

//         // Get the full artifacts that contain these chunks
//         const artifacts = await this.artifactManager.getArtifacts({ 
//             type: 'summary'
//         });
        
//         // Filter to artifacts that contain the matched chunks
//         const relevantArtifacts = artifacts.filter(artifact => 
//             results.some(r => 
//                 r.metadata.artifactId === artifact.id
//             )
//         );

//         const artifactsContext = relevantArtifacts.map(a => 
// `ID: ${a.id}
// Title: ${a.metadata?.title}
// Content: ${a.content}
// Query: ${a.metadata?.query}
// ---`).join('\n');

//         const systemPrompt = `You are a research assistant analyzing existing knowledge.
// Review these previous research summaries and determine if they contain relevant information for the current goal.
// Assess if additional research is needed or if existing information is sufficient.

// Existing Knowledge:\n${artifactsContext}`;


//         const instructions = new StructuredOutputPrompt(schema, systemPrompt);
//         const response = await this.generate({
//             message: `Goal: ${goal}`,
//             instructions
//         });

//         const selectedArtifacts = response.relevantArtifactIds ? artifacts.filter(a => response.relevantArtifactIds.includes(a.id)) : [];

//         return {
//             hasRelevantInfo: response.hasRelevantInfo,
//             existingArtifacts: selectedArtifacts,
//             needsAdditionalResearch: response.needsAdditionalResearch,
//             relevantFindings: response.relevantFindings
//         };
//     }

    // private async processResearchStep(step: string, originalGoal: string): Promise<any> {
    //     const { searchQuery, category } = await this.generateSearchQuery(originalGoal, step);
    //     const searchResults = await this.searchHelper.searchOnSearXNG(searchQuery, category);
        
    //     if (searchResults.length === 0) {
    //         return { type: 'no_results' };
    //     }

    //     const selectedUrls = await this.selectRelevantSearchResults(step, originalGoal, searchResults);
    //     if (selectedUrls.length === 0) {
    //         return { type: 'no_relevant_results' };
    //     }

    //     const pageSummaries: string[] = [];
    //     for (const url of selectedUrls.slice(0, 2)) {
    //         try {
    //             const { content, title } = await this.scrapeHelper.scrapePage(url);
    //             const summary = await this.summaryHelper.summarizeContent(step, `Page Title: ${title}\nURL: ${url}\n\n${content}`, this.lmStudioService);
    //             if (summary !== "NOT RELEVANT") {
    //                 pageSummaries.push(summary);
    //             }
    //         } catch (error) {
    //             Logger.error(`Error processing page ${url}`, error);
    //         }
    //     }

    //     return {
    //         type: 'step_results',
    //         summaries: pageSummaries,
    //         query: searchQuery,
    //         urls: selectedUrls
    //     };
    // }


    

    private async generateSearchQuery(goal: string, task: string): Promise<{ searchQuery: string, category: string}> {
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

        const systemPrompt = `You are a research assistant. Our overall goal is ${goal}.
Generate a broad web search query without special keywords or operators based on the task we've been asked to research.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const response = await this.llmService.generateStructured({ message: `Task: ${task}` }, new StructuredOutputPrompt(schema, systemPrompt), []);

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

        const selectedUrls = await this.llmService.generateStructured({ message: message }, new StructuredOutputPrompt(schema, systemPrompt), [], undefined, 2048);

        return selectedUrls.urls;
    }

    // returns summary
    private async getScrapedUrls(): Promise<Set<string>> {
        const artifacts = await this.artifactManager.getArtifacts({ type: 'webpage' });
        return new Set(artifacts.map(a => a.metadata?.url));
    }

    private async processPage(projectId: string, taskId: string, task: string, goal: string, searchUrl: string, pageSummaries: any[], visitedUrls: string[]) : Promise<string> {
        const scrapedUrls = await this.getScrapedUrls();
        
        if (visitedUrls.includes(searchUrl) || scrapedUrls.has(searchUrl)) {
            Logger.info(`Skipping already processed URL: ${searchUrl}`);
            return "";
        }
        visitedUrls.push(searchUrl);
    
        const { content, links, title } = await this.scrapeHelper.scrapePage(searchUrl);
    
        await this.publishChildLinks(projectId, WEB_RESEARCH_CHANNEL_ID, taskId, searchUrl, links, []);
    
        // Save the full website as an artifact
        await this.artifactManager.saveArtifact({
            id: crypto.randomUUID(),
            type: 'webpage',
            content,
            metadata: {
                title,
                url: searchUrl,
                task,
                projectId
            }
        });
    
        const selectedLinks = await this.selectRelevantLinks(task, goal, title, links);
        await this.publishChildLinks(projectId, WEB_RESEARCH_CHANNEL_ID, taskId, searchUrl, links, selectedLinks);
    
        if (selectedLinks.length > 0) {
            Logger.info(`Following selected links: ${selectedLinks.map(l => l.href).join(', ')}`);
            for (const link of selectedLinks) {
                try {
                    const normalizedUrl = this.scrapeHelper.normalizeUrl(searchUrl, link.href);
    
                    if (!visitedUrls.includes(normalizedUrl) && !scrapedUrls.has(normalizedUrl)) {
                        visitedUrls.push(normalizedUrl);
    
                        const { content:followContent, links:followLinks, title:followTitle } = await this.scrapeHelper.scrapePage(normalizedUrl);
                        
                        // Save followed pages as artifacts
                        await this.artifactManager.saveArtifact({
                            id: crypto.randomUUID(),
                            type: 'webpage',
                            content: followContent,
                            metadata: {
                                title: followTitle,
                                url: searchUrl,
                                task,
                                projectId
                            }
                        });
                    }
                } catch (error) {
                    Logger.error(`Error summarizing followed page ${link.href}`, error);
                }
            }
        }
    
        // Save summary(s)
        const results = await this.searchDoc(searchUrl, task, 15);
        if (results.documents.length > 0) {
            const contentWithMetadata = `Page Title: ${title}\nURL: ${searchUrl}\n\n${results.documents.join("\n\n")}`;
            const summary = await this.summaryHelper.summarizeContent(task, contentWithMetadata, this.llmService);
            pageSummaries.push(summary);
    
            // Save summary as an artifact
            await this.artifactManager.saveArtifact({
                id: crypto.randomUUID(),
                type: 'summary',
                content: summary,
                metadata: {
                    title: `Summary Report for ${searchUrl}`,
                    url: searchUrl,
                    task,
                    projectId
                }
            });
            return summary;
        } else {
            return "";
        }
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
            type: "object",
            properties: {
                links: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            href: { type: "string" },
                            text: { type: "string" }
                        },
                        required: ["href"]
                    }
                }
            },
            required: ["links"]
        };

        const history = [
            { role: "system", content: systemPrompt },
        ];

        const message = `${links.slice(0, 30).map((l, index) => `${index + 1}. URL: ${l.href}\nText: ${l.text}`).join("\n\n")}`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);

        const response = await this.llmService.generateStructured({ message }, instructions, []);
        return response.links || [];
    } catch (error) {
        Logger.error('Error selecting relevant links:', error);
        throw error;
    }
}

    getResults(): string[] {
        return this.results;
    }

    async cleanup(): Promise<void> {
        await this.scrapeHelper.cleanup();
    }
}

export default ResearchAssistant;
