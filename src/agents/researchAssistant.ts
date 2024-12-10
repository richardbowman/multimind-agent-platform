import LMStudioService, { StructuredOutputPrompt } from '../llm/lmstudioService';
import Logger from "src/helpers/logger";
import SearchHelper from '../helpers/searchHelper';
import ScrapeHelper from '../helpers/scrapeHelper';
import SummaryHelper from '../helpers/summaryHelper';
import { RESEARCHER_TOKEN, CHAT_MODEL, CHROMA_COLLECTION, WEB_RESEARCH_CHANNEL_ID, MAX_SEARCHES, RESEARCHER_USER_ID, PROJECTS_CHANNEL_ID } from '../helpers/config';
import { ChatClient, ChatPost } from '../chat/chatClient';
import { Agent, HandleActivity, HandlerParams, ResponseType } from './agents';
import { Project, RecurrencePattern, Task, TaskManager } from 'src/tools/taskManager';
import { CreateArtifact, ModelResponse, RequestArtifacts } from './schemas/ModelResponse';
import { ArtifactResponseSchema } from './schemas/artifactSchema';
import { Artifact } from 'src/tools/artifact';
import { ResponseStreamFilterSensitiveLog } from '@aws-sdk/client-bedrock-runtime';


interface ResearchPlan extends ModelResponse {
    steps: string[]
    requiresUserInput: boolean,
    existingArtifacts?: { 
        id: string, 
        title: string,
        content: string,
        underlyingData: string
     }[]
}


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

class ResearchAssistant extends Agent<ResearchProject, ResearchTask> {
    private results: string[] = [];
    private activeResearchStates: Map<string, ResearchState> = new Map();

    private searchHelper: SearchHelper;
    private scrapeHelper: ScrapeHelper;
    private summaryHelper: SummaryHelper;

    constructor(userToken: string, userId: string, chatClient: ChatClient, lmStudioService: LMStudioService, projects: TaskManager) {
        super(chatClient, lmStudioService, userId, projects);

        this.searchHelper = new SearchHelper();
        this.scrapeHelper = new ScrapeHelper();
        this.summaryHelper = new SummaryHelper();
    }
    
    public async initialize(): Promise<void> {
        Logger.info(`Initialized Research Assistant ${RESEARCHER_TOKEN}`);
        await this.chromaDBService.initializeCollection(CHROMA_COLLECTION);
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

    @HandleActivity("followup", "Answer follow-up questions about previous search results", ResponseType.RESPONSE)
    private async handleFollowup(params: HandlerParams): Promise<void> {
        const { userPost, rootPost } = params;
        const question = userPost.message;
        const rootId = params.rootPost;

        if (!rootId) {
            await this.reply(userPost, { message: "This command must be used as a reply to an existing search result." });
            return;
        }

        // Find the original search result artifact
        const relevantArtifacts = params.artifacts?.filter(a => a.type === "summary")||[];

        if (relevantArtifacts.length === 0) {
            await this.reply(userPost, { message: "Could not find the original search results to answer your question." });
            return;
        }

        // Use the most recent relevant artifact
        const artifact = relevantArtifacts[0];
        const pageSummaries = artifact.metadata?.steps || [];

        // Create a research state for the follow-up
        const stateId = userPost.id;
        const newState: ResearchState = {
            originalGoal: question,
            currentStep: "review_existing_knowledge",
            intermediateResults: [],
            existingArtifacts: [{
                id: artifact.id,
                title: artifact.metadata?.title,
                content: artifact.content.toString(),
                underlyingData: pageSummaries
            }]
        };

        this.activeResearchStates.set(stateId, newState);

        try {
            await this.executeResearchStep(newState, userPost);
        } catch (error) {
            Logger.error("Error in follow-up:", error);
            await this.reply(userPost, { message: "Sorry, I encountered an error while processing your follow-up question." });
        }
    }

    // @HandleActivity("quick-search", "Perform a quick web search and return results", ResponseType.RESPONSE) 
    // private async handleQuickSearch(params: HandlerParams): Promise<void> {
    //     const { userPost } = params;
    //     const query = userPost.message;
    //     const stateId = userPost.id;

    //     // Check if this is a response to a previous question
    //     const existingState = this.activeResearchStates.get(userPost.getRootId() || '');
    //     if (existingState && existingState.needsUserInput) {
    //         // Continue with existing research using the user's input
    //         existingState.needsUserInput = false;
    //         await this.continueResearch(existingState, userPost);
    //         return;
    //     }

    //     try {
    //         // Start new research
    //         const researchPlan = await this.planResearchSteps(query);
    //         const newState: ResearchState = {
    //             originalGoal: query,
    //             currentStep: researchPlan.steps[0],
    //             intermediateResults: [],
    //             needsUserInput: researchPlan.requiresUserInput,
    //             userQuestion: researchPlan.userQuestion
    //         };

    //         this.activeResearchStates.set(stateId, newState);

    //         if (newState.needsUserInput) {
    //             await this.reply(userPost, { message: `To help me research this better, could you please answer: ${newState.userQuestion}` });
    //             return;
    //         }

    //         await this.executeResearchStep(newState, userPost);
    //     } catch (error) {
    //         Logger.error("Error in quick search:", error);
    //         await this.reply(userPost, { message: "Sorry, I encountered an error while searching."});
    //     }
    // }

    @HandleActivity("process-research-request", "Process research request list", ResponseType.CHANNEL)
    private async handleAssistantMessage(params: HandlerParams): Promise<void> {
        const { userPost } = params;
        const query = userPost.message;
        const stateId = userPost.id;

        try {
            // Start new research
            const researchPlan = await this.planResearchSteps(query);
            const newState: ResearchState = {
                originalGoal: query,
                currentStep: researchPlan.steps[0],
                intermediateResults: [],
                needsUserInput: researchPlan.requiresUserInput,
                userQuestion: researchPlan.userQuestion,
                existingArtifacts: researchPlan.existingArtifacts
            };

            this.activeResearchStates.set(stateId, newState);

            if (newState.needsUserInput) {
                await this.reply(userPost, { message: `To help me research this better, could you please answer: ${newState.userQuestion}` });
                return;
            }

            await this.executeResearchStep(newState, userPost);
        } catch (error) {
            Logger.error("Error in research request:", error);
            await this.reply(userPost, { message: "Sorry, I encountered an error while processing this research request." });
        }
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
                await this.publishResult(WEB_RESEARCH_CHANNEL_ID, taskId, `Summary of ${searchUrl}: ${summary}`);
            } catch (error) {
                Logger.error(`Error processing page ${searchUrl}.`, error);
            }
        }

        if (pageSummaries.length > 0) {
            const overallSummary = await this.summaryHelper.createOverallSummary(goal, task, pageSummaries, this.lmStudioService);
            await this.publishResult(WEB_RESEARCH_CHANNEL_ID, taskId, `Summary for task ${task}: ${overallSummary}`);
            this.results.push(overallSummary);
        }
    }

    private async checkExistingKnowledge(goal: string): Promise<{
        hasRelevantInfo: boolean;
        existingArtifacts: Artifact[];
        needsAdditionalResearch: boolean;
        relevantFindings?: string;
    }> {
        const schema = {
            type: "object",
            properties: {
                hasRelevantInfo: {
                    type: "boolean",
                    description: "Whether relevant information was found in existing artifacts"
                },
                needsAdditionalResearch: {
                    type: "boolean",
                    description: "Whether additional research is needed beyond existing information"
                },
                relevantFindings: {
                    type: "string",
                    description: "Summary of relevant information found in existing artifacts"
                },
                relevantArtifactIds: {
                    type: "array",
                    description: "The id of each relevant artifact found in the query"
                }
            },
            required: ["hasRelevantInfo", "needsAdditionalResearch"]
        };

        // Query the vector store for relevant summaries
        const results = await this.chromaDBService.query([goal], { "type": "summary" }, 5);
        
        if (results.length === 0) {
            return {
                hasRelevantInfo: false,
                existingArtifacts: [],
                needsAdditionalResearch: true
            };
        }

        // Get the full artifacts that contain these chunks
        const artifacts = await this.artifactManager.getArtifacts({ 
            type: 'summary'
        });
        
        // Filter to artifacts that contain the matched chunks
        const relevantArtifacts = artifacts.filter(artifact => 
            results.some(r => 
                r.metadata.artifactId === artifact.id
            )
        );

        const artifactsContext = relevantArtifacts.map(a => 
`ID: ${a.id}
Title: ${a.metadata?.title}
Content: ${a.content}
Query: ${a.metadata?.query}
---`).join('\n');

        const systemPrompt = `You are a research assistant analyzing existing knowledge.
Review these previous research summaries and determine if they contain relevant information for the current goal.
Assess if additional research is needed or if existing information is sufficient.

Existing Knowledge:\n${artifactsContext}`;


        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const response = await this.generate({
            message: `Goal: ${goal}`,
            instructions
        });

        const selectedArtifacts = artifacts.filter(a => response.relevantArtifactIds.includes(a.id));

        return {
            hasRelevantInfo: response.hasRelevantInfo,
            existingArtifacts: selectedArtifacts,
            needsAdditionalResearch: response.needsAdditionalResearch,
            relevantFindings: response.relevantFindings
        };
    }

    private async planResearchSteps(goal: string): Promise<ResearchPlan> {
        // First check existing knowledge
        const knowledgeCheck = await this.checkExistingKnowledge(goal);

        if (knowledgeCheck.hasRelevantInfo && !knowledgeCheck.needsAdditionalResearch) {
            return {
                message: "Found relevant info and we don't need additional research",
                steps: ["synthesize_existing_knowledge"],
                requiresUserInput: false,
                existingArtifacts: knowledgeCheck.existingArtifacts.map(a => ({
                    id: a.id,
                    content: a.content.toString(),
                    title: a.metadata?.title,
                    underlyingData: a.metadata?.steps
                }))
            };
        }

        const schema = {
            type: "object",
            properties: {
                steps: {
                    type: "array",
                    items: {
                        type: "string"
                    },
                    description: "List of research steps needed"
                },
                requiresUserInput: {
                    type: "boolean",
                    description: "Whether user input is needed before proceeding"
                },
                userQuestion: {
                    type: "string",
                    description: "Question to ask the user if input is needed"
                }
            },
            required: ["steps"]
        };

        const systemPrompt = `You are a research assistant planning how to investigate a topic.
${knowledgeCheck.hasRelevantInfo ? 'We have some relevant existing knowledge but need additional research.' : 'We need to conduct new research.'}
Break down the research goal into specific steps that will help achieve the best result.
If you need to ask the user for clarification, set requiresUserInput to true and specify the question.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const response : ResearchPlan = await this.generate({
            message: goal,
            instructions
        });

        // If we have existing knowledge, prepend a step to review it
        if (knowledgeCheck.hasRelevantInfo) {
            response.steps.unshift("review_existing_knowledge");
            response.existingArtifacts = knowledgeCheck.existingArtifacts.map(a => ({
                id: a.id,
                content: a.content.toString(),
                title: a.metadata?.title,
                underlyingData: a.metadata?.steps
            }));
        }
        
        return response;
    }

    private async processResearchStep(step: string, originalGoal: string): Promise<any> {
        const { searchQuery, category } = await this.generateSearchQuery(originalGoal, step);
        const searchResults = await this.searchHelper.searchOnSearXNG(searchQuery, category);
        
        if (searchResults.length === 0) {
            return { type: 'no_results' };
        }

        const selectedUrls = await this.selectRelevantSearchResults(step, originalGoal, searchResults);
        if (selectedUrls.length === 0) {
            return { type: 'no_relevant_results' };
        }

        const pageSummaries: string[] = [];
        for (const url of selectedUrls.slice(0, 2)) {
            try {
                const { content, title } = await this.scrapeHelper.scrapePage(url);
                const summary = await this.summaryHelper.summarizeContent(step, `Page Title: ${title}\nURL: ${url}\n\n${content}`, this.lmStudioService);
                if (summary !== "NOT RELEVANT") {
                    pageSummaries.push(summary);
                }
            } catch (error) {
                Logger.error(`Error processing page ${url}`, error);
            }
        }

        return {
            type: 'step_results',
            summaries: pageSummaries,
            query: searchQuery,
            urls: selectedUrls
        };
    }

    private async determineNextAction(state: ResearchState): Promise<{
        needsUserInput: boolean;
        question?: string;
        isComplete: boolean;
        nextStep?: string;
    }> {
        const schema = {
            type: "object",
            properties: {
                needsUserInput: {
                    type: "boolean",
                    description: "Whether we need to ask the user a question"
                },
                question: {
                    type: "string",
                    description: "Question to ask the user if needed"
                },
                isComplete: {
                    type: "boolean",
                    description: "Whether we have enough information to generate final response"
                },
                nextStep: {
                    type: "string",
                    description: "Next research step if not complete"
                }
            },
            required: ["needsUserInput", "isComplete"]
        };

        const systemPrompt = `You are a research assistant analyzing intermediate results.
Based on the current state and results, determine if we:
1. Need to ask the user a question
2. Have enough information to generate a final response
3. Should continue with another research step

Consider the original goal and what we've learned so far.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const context = JSON.stringify({
            originalGoal: state.originalGoal,
            currentStep: state.currentStep,
            results: state.intermediateResults
        }, null, 2);

        return await this.generate({
            message: context, 
            instructions
        });
    }

    private async generateFinalResponse(state: ResearchState): Promise<ModelResponse> {
        const schema = {
            type: "object",
            properties: {
                message: {
                    type: "string",
                    description: "Final comprehensive response in Markdown format."
                }
            },
            required: ["message"]
        };

        const systemPrompt = `You are a research assistant generating a final response.
Synthesize all the intermediate results into a clear, comprehensive answer that addresses the original goal.
Include relevant details from all research steps while maintaining clarity and coherence.
You will respond inside of the message key in Markdown format. `;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const context = JSON.stringify({
            originalGoal: state.originalGoal,
            results: state.intermediateResults
        }, null, 2);

        const response = await this.generate({
            message: context, 
            instructions,
            maxTokens: 16384
        });

        return response;
    }

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
        const response = await this.lmStudioService.generateStructured({ message: `Task: ${task}` }, new StructuredOutputPrompt(schema, systemPrompt), []);

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

        const selectedUrls = await this.lmStudioService.generateStructured({ message: message }, new StructuredOutputPrompt(schema, systemPrompt), [], undefined, 2048);

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
            const summary = await this.summaryHelper.summarizeContent(task, contentWithMetadata, this.lmStudioService);
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

        const responseLinks = await this.lmStudioService.generateStructured({ message }, instructions, []);
        return responseLinks;
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

    private async executeResearchStep(state: ResearchState, userPost: ChatPost): Promise<void> {
        try {
            let stepResult;
            
            // Handle special knowledge-base steps
            if (state.currentStep === "review_existing_knowledge") {
                stepResult = {
                    type: 'existing_knowledge',
                    findings: state.existingArtifacts
                };
            } else if (state.currentStep === "synthesize_existing_knowledge") {
                // Generate response purely from existing knowledge
                const finalResponse = await this.generateFinalResponse({
                    ...state,
                    intermediateResults: [{
                        type: 'existing_knowledge',
                        findings: state.existingArtifacts
                    }]
                });
                
                const response: RequestArtifacts = {
                    message: `Based on our existing knowledge:\n\n${finalResponse.message}\n\n---\nYou can ask follow-up questions about these results by replying with "@researchteam followup <your question>"`,
                    artifactIds: state.existingArtifacts?.map(a => a.id)
                };
                await this.reply(userPost, response);
                return;
            } else {
                // Execute normal research step
                stepResult = await this.processResearchStep(state.currentStep, state.originalGoal);
            }

            state.intermediateResults.push(stepResult);

            // Determine next steps
            const nextAction = await this.determineNextAction(state);
            
            if (nextAction.needsUserInput) {
                state.needsUserInput = true;
                state.userQuestion = nextAction.question;
                if (nextAction.question) {
                    await this.reply(userPost, { message: nextAction.question });
                    return;
                }
            }

            if (nextAction.isComplete) {
                // Generate final response using all intermediate results
                const finalResponse = await this.generateFinalResponse(state);
                
                // Save the final response as an artifact
                const artifactId = crypto.randomUUID();
                const artifact = await this.artifactManager.saveArtifact({
                    id: artifactId,
                    type: 'summary',
                    content: finalResponse.message,
                    metadata: {
                        title: `Research Summary: ${state.originalGoal}`,
                        query: state.originalGoal,
                        type: 'summary',
                        steps: state.intermediateResults
                    }
                });

                const response : CreateArtifact = {
                    message: `${finalResponse.message}\n\n---\nYou can ask follow-up questions about these results by replying with "@researchteam followup <your question>"`,
                    artifactId: artifact.id,
                    artifactTitle: artifact.metadata?.title
                }

                await this.reply(userPost, response);
                return;
            }

            // Continue with next step
            state.currentStep = nextAction.nextStep;
            await this.executeResearchStep(state, userPost);

        } catch (error) {
            Logger.error("Error in research step:", error);
            await this.reply(userPost, { message: "Sorry, I encountered an error while researching your question."} );
        }
    }

    private async continueResearch(state: ResearchState, userPost: ChatPost): Promise<void> {
        // Update the research state with user's input and continue
        state.intermediateResults.push({
            type: 'user_input',
            question: state.userQuestion,
            answer: userPost.message
        });

        await this.executeResearchStep(state, userPost);
    }
}

export default ResearchAssistant;
