import Logger from "src/helpers/logger";
import LMStudioService, { StructuredOutputPrompt } from '../llm/lmstudioService'; // Import the LMStudioService
import { WEB_RESEARCH_CHANNEL_ID, PROJECTS_CHANNEL_ID, CHROMA_COLLECTION, RESEARCH_MANAGER_USER_ID, RESEARCHER_USER_ID } from '../helpers/config';
import { randomUUID } from 'crypto';
import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from '../chat/chatClient';
import 'reflect-metadata';
import { Agent, HandleActivity, HandlerParams, ResponseType } from "./agents";
import EmailWorkflow from "./workflows/emailWorkflow";
import { TaskManager } from "src/tools/taskManager";
import { ResearchProject, ResearchTask } from "./researchAssistant";
import { Artifact } from "src/tools/artifact";
import { ArtifactManager } from "src/tools/artifactManager";

export enum ResearchActivityType {
    DraftEmail = "draft-email",
    WebResearch = "web-research"
}

interface ResearchManagerContext extends ConversationContext {
    activityType: ResearchActivityType;
}

export class ResearchManager extends Agent<ResearchProject, ResearchTask> {
    private USER_TOKEN: string;
    private artifactManager: ArtifactManager;

    constructor(chatUserToken: string, userId: string, chatClient: ChatClient, lmStudioService: LMStudioService, projects: TaskManager) {
        super(chatClient, lmStudioService, userId, projects);
        this.USER_TOKEN = chatUserToken;
        this.artifactManager = new ArtifactManager(this.chromaDBService);
    }

    public async initialize() {
        await this.chromaDBService.initializeCollection(CHROMA_COLLECTION);
        await super.setupChatMonitor(PROJECTS_CHANNEL_ID, "@research");
    }

    protected async taskNotification(task: ResearchTask): Promise<void> {
        const project = await this.projects.getProject(task.projectId);
        if (!project) {
            Logger.error(`Could not find project with ID ${task.projectId}`);
            return;
        }

        Logger.info(`Starting research for project ${project.id}`);

        // Decompose the task into sub-tasks
        await this.decomposeTask(project.id, task.description);

        // Assign tasks to researchers
        await this.assignResearcherTasks(project.id);

        const post = await this.getMessage(project.originalPostId);

        // Post the task list to the channel
        const projectPost = await this.replyWithProjectId(task.type as ResearchActivityType, project.id, PROJECTS_CHANNEL_ID, post);
        await this.postTaskList(project.id, PROJECTS_CHANNEL_ID, projectPost);
    }

    protected async projectCompleted(project: ResearchProject): Promise<void> {
        const aggregatedData = await this.aggregateResults(project);

        const { content, title } = await this.createFinalReport(project, aggregatedData);
        const overallSummary = content;

        // find my original post
        const posts = await this.chatClient.fetchPreviousMessages(PROJECTS_CHANNEL_ID);
        const post = posts.find(c => c.props['project-id'] === project.id && c.user_id == this.userId && !c.getRootId());

        if (post) {
            await this.reply(post, {
                message: overallSummary
            });

        } else {
            await this.chatClient.postInChannel(PROJECTS_CHANNEL_ID, overallSummary);
        }

        // Save the report to an artifact
        const artifact: Artifact = {
            id: project.id,
            type: 'report',
            content: overallSummary,
            metadata: {
                title: title
            }
        };

        await this.artifactManager.saveArtifact(artifact);
        Logger.info(`Report saved as artifact with ID ${project.id} and title "${title}"`);
    }

    private async replyWithProjectId(activityType: ResearchActivityType, projectId: string, channelId: string, post: ChatPost): Promise<ChatPost> {
        const postProps: ConversationContext = {
            'project-id': projectId,
            'conversation-root': post.id,
            'activity-type': activityType
        };
        const responseMessage = `I've received your request for a project!
Project ID: **${projectId}**
Activity Type: **${activityType}**`;
        
        if (post.id) {
            return this.reply(post, { message: responseMessage }, postProps);
        } else {
            return this.chatClient.postInChannel(channelId, responseMessage, postProps);
        }
    }

    // @HandleActivity('web-research', "Initiate research for user request", ResponseType.CHANNEL)
    // private async handleWebResearch(params: HandlerParams) {
    //     const project = this.addProject();

    //     await this.decomposeTask(project.id, post.message);

    //     const projectPost = await this.replyWithProjectId(ActivityType.WebResearch, project.id, channelId, post);

    //     // tell the user
    //     await this.postTaskList(project.id, channelId, projectPost);

    //     // post each task to researchers in research channel
    //     await this.assignResearcherTasks(project.id);
    // }

    // @HandleActivity('web-research', "Response to initial web research", ResponseType.RESPONSE)
    // private async continueWebResearch(projectChain: ProjectChainResponse, post: ChatPost): Promise<void> {
    //     if (post.getRootId()) {
    //         const reply = await this.generateResearchReply(post.getRootId() || "", projectChain.posts);
    //         await this.chatClient.postReply(post.getRootId() || "", post.channel_id, reply);
    //     } else {
    //         Logger.error("No root ID found in the project chain.")
    //     }
    // }



    // @HandleActivity('draft-email', "Perform copy-editing to create an email draft.", ResponseType.CHANNEL)
    // private async handleDraftEmail(channelId: string, post: ChatPost) {
    //     const projectId = randomUUID();
    //     Logger.info("Kicking off draft email workflow");

    //     await this.decomposeTask(projectId, post.message);

    //     const projectPost = await this.replyWithProjectId(ActivityType.DraftEmail, projectId, channelId, post);

    //     const taskListMessage = await this.postTaskList(projectId, channelId, projectPost);
    // }

    // @HandleActivity('draft-email', "Alter the original email based on comments", ResponseType.RESPONSE)
    // private async continueDraftEmail(projectChain: ProjectChainResponse, post: ChatPost): Promise<void> {
    //     const workflow = new EmailWorkflow(projectChain.projectId, post.message, this.lmStudioService);
    //     const response = await workflow.generateEmailReply(projectChain.posts);

    //     // Send the draft email back to the user
    //     await this.chatClient.postReply(post.getRootId(), post.channel_id, `Here is your draft email:\n\n${response}`);
    // }
    @HandleActivity('web-research', "Initiate research for user request", ResponseType.CHANNEL)
    private async handleWebResearch(params: HandlerParams) {
        const { userPost } = params;
        const project = this.addProject();

        await this.decomposeTask(project.id, userPost.message);

        const projectPost = await this.replyWithProjectId(ResearchActivityType.WebResearch, project.id, userPost.channel_id, userPost);

        // tell the user
        await this.postTaskList(project.id, userPost.channel_id, projectPost);

        // post each task to researchers in research channel
        await this.assignResearcherTasks(project.id);
    }

    @HandleActivity('web-research', "Response to initial web research", ResponseType.RESPONSE)
    private async continueWebResearch(params: ProjectHandlerParams): Promise<void> {
        const { projectChain, userPost } = params;
        if (userPost.getRootId()) {
            const reply = await this.generateResearchReply(userPost.getRootId() || "", projectChain.posts);
            await this.chatClient.postReply(userPost.getRootId() || "", userPost.channel_id, reply);
        } else {
            Logger.error("No root ID found in the project chain.")
        }
    }

    @HandleActivity('draft-email', "Perform copy-editing to create an email draft.", ResponseType.CHANNEL)
    private async handleDraftEmail(params: HandlerParams) {
        const { userPost } = params;
        const projectId = randomUUID();
        Logger.info("Kicking off draft email workflow");

        await this.decomposeTask(projectId, userPost.message);

        const projectPost = await this.replyWithProjectId(ResearchActivityType.DraftEmail, projectId, userPost.channel_id, userPost);

        const taskListMessage = await this.postTaskList(projectId, userPost.channel_id, projectPost);
    }

    @HandleActivity('draft-email', "Alter the original email based on comments", ResponseType.RESPONSE)
    private async continueDraftEmail(params: ProjectHandlerParams): Promise<void> {
        const { projectChain, userPost } = params;
        const workflow = new EmailWorkflow(projectChain.projectId, userPost.message, this.lmStudioService);
        const response = await workflow.generateEmailReply(projectChain.posts);

        // Send the draft email back to the user
        await this.chatClient.postReply(userPost.getRootId(), userPost.channel_id, `Here is your draft email:\n\n${response}`);
    }

    private async fetchResearcherMessages(): Promise<ChatPost[]> {
        return this.chatClient.fetchPreviousMessages(WEB_RESEARCH_CHANNEL_ID);
    }

    public addProject(): ResearchProject {
        const p: ResearchProject = {
            id: randomUUID(),
            name: "New Project",
            tasks: {}
        };
        this.projects.addProject(p);
        return p;
    }

    private async decomposeTask(projectId: string, task: string) {
        try {
            const systemPrompt = `
    You are a research orchestrator. Follow the following steps:
    1) Restate the user's goal.
    2) Analyze the user's request and explain how you will satisfy the request.
    3) Specify a MAXIMUM of ${process.env.MAX_RESEARCH_REQUESTS} research requests. Use as FEW AS POSSIBLE to satisfy the request.
    
    Provide only a JSON object in the format:
    {
        "goal": "User wants to ...",
        "strategy": "I will search for ...",
        "researchRequested": [
            "Please look for X",
            ...
        ]
    }
    `;

            const schema = {
                type: 'object',
                properties: {
                    goal: { type: 'string' },
                    strategy: { type: 'string' },
                    researchRequested: {
                        type: 'array',
                        items: { type: 'string' }
                    }
                },
                required: ['goal', 'strategy', 'researchRequested']
            };

            const structuredPrompt = new StructuredOutputPrompt(schema, systemPrompt);

            const userPrompt = task;
            const history: any[] = [];

            const project = this.projects.getProject(projectId);
            const responseJSON = await this.lmStudioService.sendStructuredRequest(userPrompt, structuredPrompt, history);

            if (responseJSON.goal) {
                project.name = responseJSON.goal;
            }
            if (responseJSON.researchRequested) {
                for (const task of responseJSON.researchRequested) {
                    const taskId = randomUUID();
                    this.projects.addTask(project, new ResearchTask(taskId, projectId, task, RESEARCH_MANAGER_USER_ID));
                }
            } else {
                throw new Error('Invalid response from LM Studio API');
            }
        } catch (error) {
            Logger.error('Error decomposing task:', error);
        }
    }

    private async postTaskList(projectId: string, channelId: string, projectPost: ChatPost): Promise<ChatPost> {
        const project = this.projects.getProject(projectId);
        const tasks = Object.values(project.tasks);

        const taskListMessage = `
Goal: ${this.projects.getProject(projectId).name}
Project Type: Web Research
Tasks distributed successfully:
${tasks.map(({ description }) => ` - ${description}`).join("\n")}`;

        const taskPost = await this.chatClient.replyThreaded(projectPost, taskListMessage);
        return taskPost;
    }

    private async assignResearcherTasks(projectId: string) {
        const project = this.projects.getProject(projectId);
        const tasks = Object.values(project.tasks);

        Logger.info(`Distributing ${tasks.length} tasks`);
        for (const task of tasks) {
            this.projects.assignTaskToAgent(task.id, RESEARCHER_USER_ID);
        }
    }

    private async aggregateResults(project: ResearchProject): Promise<string> {
        Logger.info(`Aggregating results for ${project.id}`);

        const queryTexts = [project.name];
        const where: any = {
            "$and": [
                { "type": { "$eq": "summary" } },
                { "projectId": { "$eq": project.id } }
            ]
        };
        const nResults = 15;

        try {
            const response = await this.chromaDBService.query(queryTexts, where, nResults);
            
            // Sort the results by score in descending order
            response.sort((a, b) => b.score - a.score);

            const results = response.map((r, index) => 
                `<search result="${index+1}">
Title: ${r.metadata.title}
URL: ${r.metadata.url}
Chunk: ${r.metadata.chunkId} of ${r.metadata.chunkTotal}
Relevancy Score: ${Math.round(r.score*1000)/10}
Chunk ID: ${r.id}'
Document ID: ${r.metadata.docId}
Content Excerpt: ${r.text}
</search>`).join("\n\n");
            Logger.info(`Query Results: ${results}`);

            return results;
        } catch (error) {
            Logger.error('Error querying ChromaDB:', error);
            throw error;
        }
    }

    private async createFinalReport(project: ResearchProject, aggregatedData: string): Promise<{ content: string, title: string }> {
        try {
            const systemPrompt = `
You are a research manager. Your team of research assistants have completed web searches to look up information
based on your original requests list. Generate a comprehensive report based on the aggregated data and the user's original prompt.
Make sure to include sources back to the results. Do not make up information missing in the search results.
`;

            const schema = {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    content: { type: 'string' }
                },
                required: ['title', 'content']
            };

            const userPrompt = `Original Prompt: ${project.name}\nAggregated Data:\n${aggregatedData}`;


            // Use StructuredOutputPrompt to generate the report
            const structuredPrompt = new StructuredOutputPrompt(schema, systemPrompt);
            const responseJSON = await this.lmStudioService.sendStructuredRequest(userPrompt, structuredPrompt, undefined, undefined, 32000);

            if (responseJSON.title && responseJSON.content) {
                return { content: responseJSON.content, title: responseJSON.title };
            } else {
                throw new Error('Invalid response from LM Studio API');
            }
        } catch (error) {
            Logger.error('Error generating final report:', error);
            throw error;
        }
    }

    private async generateResearchReply(rootId: string, chatHistory: ChatPost[]): Promise<string> {
        try {
            const systemPrompt = `
You are a research manager. Your team of research assistants have done web searches to look up things based on the original task list. Generate a comprehensive report based on the aggregated data and the user's original prompt.

You've already provided a detailed explanation of the findings. Now the user is responding with questions or followups. Do not make up information not specified previous or provided in query results.
`;

            return this.generateReply(systemPrompt, chatHistory);
        } catch (error) {
            Logger.error('Error generating final report:', error);
            throw error;
        }
    }

    private async generateReply(systemPrompt: string, chatHistory: ChatPost[]): Promise<string> {
        const history = [
            { role: "system", content: systemPrompt },
            ...(chatHistory || []).map(post => ({ role: post.sender === this.USER_TOKEN ? 'user' : 'assistant', content: post.message }))
        ];
        const response = await this.lmStudioService.sendMessageToLLM(history[history.length - 1].content, history);
        return response;
    }
}