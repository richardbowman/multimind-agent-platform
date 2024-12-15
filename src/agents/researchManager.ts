import Logger from "src/helpers/logger";
import { PROJECTS_CHANNEL_ID } from '../helpers/config';
import { ChatPost, ConversationContext } from '../chat/chatClient';
import { HandlerParams } from "./agents";
import { Project } from "src/tools/taskManager";
import { ResearchTask } from "./researchAssistant";
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { StepBasedAgent } from './stepBasedAgent';
import { MultiStepPlanner } from './planners/DefaultPlanner';
import { ModelHelpers } from 'src/llm/helpers';
import { ResearchDecompositionExecutor } from './executors/ResearchDecompositionExecutor';
import { ResearchAggregationExecutor } from './executors/ResearchAggregationExecutor';

export interface ResearchProject extends Project<ResearchTask> {
    goal: string;
}

export class ResearchManager extends StepBasedAgent<ResearchProject, ResearchTask> {
    constructor(params: AgentConstructorParams) {
        const modelHelpers = new ModelHelpers(params.llmService, params.userId);
        const planner = new MultiStepPlanner(params.llmService, params.taskManager, params.userId, modelHelpers);
        super(params, planner);
        
        // Register research-specific executors
        this.registerStepExecutor(new ResearchDecompositionExecutor(params.llmService, params.taskManager));
        this.registerStepExecutor(new ResearchAggregationExecutor(params.llmService, this.artifactManager, params.vectorDBService));

        this.modelHelpers.setPurpose(`You are planning how to conduct research effectively.
Break down research requests into specific tasks and aggregate findings.
Use 'decompose-research' steps to break down requests,
'assign-researchers' to distribute tasks, and
'aggregate-research' to compile findings into a final report.

IMPORTANT: Always follow this pattern:
1. Start with a 'decompose-research' step to break down the request
2. Use 'assign-researchers' to distribute tasks
3. End with an 'aggregate-research' to compile findings`);
    }

    protected async taskNotification(task: ResearchTask): Promise<void> {
        try {
            if (task.type === "assign-researchers") {
                if (task.complete) {
                    const project = this.projects.getProject(task.projectId);
                    this.planSteps({ 
                        message: "Researchers completed tasks.", 
                        projects: [project]
                    } as HandlerParams);

                    const post = await this.chatClient.getPost(project.metadata.originalPostId);
                    await this.executeNextStep(project.id, post);
                }
            } else {
                super.taskNotification(task);
            }
        } catch (error) {
            Logger.error('Error handling task:', error);
            throw error;
        }
    }

    public async initialize(): Promise<void> {
        await super.setupChatMonitor(PROJECTS_CHANNEL_ID, "@research");
        this.processTaskQueue();
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

            const schema = await getGeneratedSchema(SchemaType.ResearchDecomposition);
            const structuredPrompt = new StructuredOutputPrompt(schema, systemPrompt);

            const userPrompt = task;
            const history: any[] = [];

            const project = this.projects.getProject(projectId);
            const responseJSON = await this.llmService.sendStructuredRequest<ResearchDecomposition>(userPrompt, structuredPrompt, history);

            if (responseJSON.goal) {
                project.name = responseJSON.goal;
            }
            if (responseJSON.researchRequested) {
                const researcherTasks: ResearchTask[] = [];
                for (const task of responseJSON.researchRequested) {
                    const taskId = randomUUID();
                    const taskDescription = `${task} [${responseJSON.goal}]`;
                    researcherTasks.push(await this.projects.addTask(project, new ResearchTask(taskId, projectId, taskDescription, RESEARCH_MANAGER_USER_ID)));
                }
                return
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
        // assign all unassigned tasks
        const tasks = Object.values(project.tasks).filter(t => !t.assignee);

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
        const nResults = 20;

        try {
            const response = await this.vectorDB.query(queryTexts, where, nResults);

            // Sort the results by score in descending order
            response.sort((a, b) => b.score - a.score);

            const results = response.map((r, index) =>
                `<search result="${index + 1}">
Title: ${r.metadata.title}
URL: ${r.metadata.url}
Chunk: ${r.metadata.chunkId} of ${r.metadata.chunkTotal}
Relevancy Score: ${Math.round(r.score * 1000) / 10}
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

    private async createFinalReport(project: ResearchProject, aggregatedData: string): Promise<ArtifactResponseSchema> {
        try {
            const systemPrompt = `
You are a research manager. Your team of research assistants have completed web searches to look up information
based on your original requests list. Generate a comprehensive report based on the aggregated data and the user's original prompt.
Make sure to include sources back to the results. Do not make up information missing in the search results.
Make sure you put the entire report inside the artifactContent field in Markdown format.

Your reponse should look like:
{
  "artifactTitle": "Report on X",
  "artifactContent": "This is the report\n# Heading 1\nMore content here",
  "message": "I've prepared a very interesting report including X, Y, and Z unique points."
}
`;


            const userPrompt = `Original Prompt: ${project.name}\nAggregated Data:\n${aggregatedData}`;

            // Use StructuredOutputPrompt to generate the report
            const schema = await getGeneratedSchema(SchemaType.ResearchArtifactResponse);
            const structuredPrompt = new StructuredOutputPrompt(schema, systemPrompt);
            const responseJSON = await this.llmService.sendStructuredRequest<ResearchArtifactResponse>(userPrompt, structuredPrompt, undefined, undefined, 32000);
            return responseJSON;
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
        const response = await this.llmService.sendMessageToLLM(history[history.length - 1].content, history);
        return response;
    }
}
