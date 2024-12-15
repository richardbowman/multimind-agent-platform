import { randomUUID } from 'crypto';
import JSON5 from "json5";
import { ChatClient, ChatPost, ConversationContext, Message, ProjectChainResponse } from "src/chat/chatClient";
import Logger from "src/helpers/logger";
import { SystemPromptBuilder } from "src/helpers/systemPrompt";
import { CreateArtifact, ModelMessageResponse } from "src/schemas/ModelResponse";
import { InputPrompt } from "src/prompts/structuredInputPrompt";
import { Artifact } from "src/tools/artifact";
import { ArtifactManager } from "src/tools/artifactManager";
import { Project, Task, TaskManager } from "src/tools/taskManager";
import { ArtifactResponseSchema } from '../schemas/artifactSchema';
import schemas from '../schemas/schema.json';
import { ArtifactInputPrompt } from 'src/prompts/artifactInputPrompt';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ILLMService } from 'src/llm/ILLMService';
import { SearchResult, IVectorDatabase } from 'src/llm/IVectorDatabase';
import { StructuredOutputPrompt } from "src/llm/ILLMService";

export interface ActionMetadata {
    activityType: string;
    usage: string;
}

export enum ResponseType {
    RESPONSE,
    CHANNEL
}

export interface HandlerParams extends GenerateParams {
    userPost: ChatPost;
    rootPost?: ChatPost;
    threadPosts?: ChatPost[];
}

export interface GenerateInputParams extends GenerateParams {
    instructions: string | InputPrompt | StructuredOutputPrompt;
    threadPosts?: ChatPost[];
}

export interface GenerateParams {
    artifacts?: Artifact[];
    projects?: Project<Task>[];
    searchResults?: SearchResult[]
    message?: string;
    contextWindow?: number;
    maxTokens?: number;
}

export interface ProjectHandlerParams extends HandlerParams {
    projectChain: ProjectChainResponse;
}

// Custom decorator to map activity types to methods
export function HandleActivity(activityType: string, usage: string, responseType: ResponseType) {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
        Reflect.defineMetadata('activityType', activityType, target, propertyKey);
        Reflect.defineMetadata('usage', usage, target, propertyKey);
        Reflect.defineMetadata('responseType', responseType, target, propertyKey);
    };
}

export interface ThreadSummary {
    summary: string;
    lastProcessedMessageId: string;
    messageCount: number;
}

export abstract class Agent<Project, Task> {
    private chatClient: ChatClient;
    private threadSummaries: Map<string, ThreadSummary> = new Map();

    protected llmService: ILLMService;
    protected userId: string;
    protected chromaDBService: IVectorDatabase;
    protected promptBuilder: SystemPromptBuilder;
    protected projects: TaskManager;
    protected artifactManager: ArtifactManager;
    protected isWorking: boolean = false;
    protected modelHelpers: ModelHelpers;

    protected abstract projectCompleted(project: Project): void;
    protected abstract processTask(task: Task): Promise<void>;
    protected abstract handlerThread(params: HandlerParams): Promise<void>;
    protected abstract handleChannel(params: HandlerParams): Promise<void>;


    constructor(chatClient: ChatClient, llmService: ILLMService, userId: string, projects: TaskManager, vectorDBService: IVectorDatabase) {
        this.modelHelpers = new ModelHelpers(llmService, userId);
        this.chatClient = chatClient;
        this.llmService = llmService;
        this.userId = userId;
        this.chromaDBService = vectorDBService;
        this.promptBuilder = new SystemPromptBuilder();
        this.artifactManager = new ArtifactManager(this.chromaDBService);
        this.projects = projects;

        if (this.projects) {
            this.projects.on("taskAssigned", async (event) => {
                if (event.assignee === this.userId) {
                    await this.taskNotification(event.task);
                }
            });
            this.projects.on("taskCompleted", async (event) => {
                if (event.assignee === this.userId) {
                    await this.taskNotification(event.task);
                }
            });

            this.projects.on("projectCompleted", async (event) => {
                if (event.creator === this.userId) {
                    await this.projectCompleted(event.project);
                }
            })
        } else {
            Logger.warn(`Agent ${this.constructor.name} didn't provide access to task manager`);
        }
    }

    protected async taskNotification(task: Task): Promise<void> {
        await this.processTaskQueue(task);
    }

    async processTaskQueue(): Promise<void> {
        if (this.isWorking) {
            Logger.info('Task queue is already being processed');
            return;
        }

        this.isWorking = true;
        let processedCount = 0;

        try {
            while (true) {
                const task: Task = await this.projects.getNextTaskForUser(this.userId);
                if (!task) {
                    Logger.info(`Task queue processing complete. Processed ${processedCount} tasks.`);
                    return;
                }

                Logger.info(`Processing task ${task.id}: ${task.description}`);
                try {
                    // Mark task as in progress before starting
                    await this.projects.markTaskInProgress(task);

                    // Attempt to process the task
                    await this.processTask(task);

                    processedCount++;
                } catch (error) {
                    // If task fails, leave it in progress but log the error
                    Logger.error(`Failed to process task ${task.id}:`, error);
                    // Re-throw to stop processing queue on error
                    throw error;
                }
            }
        } finally {
            this.isWorking = false;
        }
    }

    public setPurpose(purpose: string) {
        this.modelHelpers.setPurpose(purpose)
    }

    protected enableMemory() {
        this.modelHelpers.enableMemory();
    }

    protected async send(post: Message, channelId: string) {
        try {
            // Assuming you have a chatClient or similar service to send messages to the channel
            await this.chatClient.postInChannel(channelId, post.message, post.props);
            Logger.info(`Message sent to channel ${channelId}: ${post.message}`);
        } catch (error) {
            Logger.error(`Failed to send message to channel ${channelId}:`, error);
        }
    }

    protected async reply(post: ChatPost, response: ModelMessageResponse, postProps?: ConversationContext): Promise<ChatPost> {
        const artifactIds = [...postProps?.["artifact-ids"] || [], ...response.artifactIds || [], ...response.artifactId ? [response.artifactId] : []];

        // Include project ID in props if present in response
        const responseProps = {
            ...postProps,
            "artifact-ids": artifactIds,
            ...(response.projectId && { "project-id": response.projectId })
        };

        const reply = await this.chatClient.replyThreaded(post, response.message, responseProps);


        if (this.isMemoryEnabled) {
            // Fetch the latest memory artifact
            const latestMemoryArtifact = await this.fetchLatestMemoryArtifact(post.channel_id);
            const previousMemory = latestMemoryArtifact ? latestMemoryArtifact.content.toString() : undefined;

            // Analyze the latest messages and identify important points
            const importantPoints = await this.classifyImportantInformation(post.channel_id, [post, reply], previousMemory);

            // Revise the memory artifact with the new important points
            await this.reviseMemoryArtifact(post.channel_id, importantPoints, previousMemory);
        }

        return reply;
    }

    // Common method for fetching previous messages
    protected async fetchMessages(channelId: string): Promise<ChatPost[]> {
        return await this.chatClient.fetchPreviousMessages(channelId);
    }

    public setupChatMonitor(monitorChannelId: string, handle?: string) {
        if (handle) this.chatClient.registerHandle(handle);

        // Initialize the WebSocket client for real-time message listening
        this.chatClient.receiveMessages(async (post: ChatPost) => {
            // Get the channel ID and user ID
            const channelId = post.channel_id;
            const userId = post.user_id;

            if (monitorChannelId === channelId && userId !== this.userId) {
                Logger.verbose(`Received message: ${post.message.slice(0, 100)}... in ${channelId} from ${userId}, with root id ${post.getRootId()}`);

                let context: ConversationContext | undefined;

                if (!post.getRootId() && post.message.startsWith(handle)) {
                    // Determine the type of activity using an LLM
                    await this.handleChannel({ userPost: post });
                } else if (post.getRootId()) {
                    const postRootId: string = post.getRootId() || "";

                    Logger.verbose(`Received thread message: ${post.message} in ${channelId} from ${userId}, with root id ${postRootId}`);

                    const posts = await this.chatClient.getThreadChain(post);
                    // only respond to chats directed at "me"
                    if (posts[0].message.startsWith(handle)) {
                        // Get all available actions for this response type
                        const projectIds = posts.map(p => p.props["project-id"]).filter(id => id !== undefined);
                        const projects = [];
                        for (const projectId of projectIds) {
                            const project = this.projects.getProject(projectId);
                            if (project) projects.push(project);
                        }

                        let requestedArtifacts: string[] = [], searchResults: SearchResult[] = [];

                        const allArtifacts = [...new Set([...requestedArtifacts, ...posts.map(p => p.props["artifact-ids"] || [])].flat())];
                        const artifacts = await this.mapRequestedArtifacts(allArtifacts);

                        this.handlerThread({
                            userPost: post,
                            rootPost: posts[0],
                            artifacts,
                            projects,
                            threadPosts: posts.slice(1, -1),
                            searchResults
                        });
                    }
                }
            } else {
                // Logger.info(`Ignoring message: ${post.message} in ${channelId} from ${userId}, with root id ${post.root_id}`);
            }
        });
    }

    protected async generateStructured(structure: StructuredOutputPrompt, params: GenerateParams): Promise<ModelMessageResponse> {
        return this.modelHelpers.generate({
            instructions: structure, 
            ...params
        });
    }

    protected async generate(params: GenerateInputParams): Promise<ModelMessageResponse> {
        return this.modelHelpers.generate(params);
    }


    private async getArtifactList(): Promise<string> {
        const artifacts = await this.artifactManager.listArtifacts();
        const filteredArtifacts = artifacts.filter(a =>
            a.metadata?.title?.length > 0 &&
            !a.id.includes('memory') &&
            a.type !== 'webpage'
        )
        return filteredArtifacts.map(artifact => ` - ${artifact.id}: ${artifact.metadata?.title}`).join('\n');
    }

    private async getThreadSummary(posts: ChatPost[]): Promise<string> {
        return this.modelHelpers.getThreadSummary(posts);
    }

    private cleanupOldSummaries(maxAge: number = 1000 * 60 * 60) { // default 1 hour
        const now = Date.now();
        for (const [threadId, summary] of this.threadSummaries.entries()) {
            const message = this.getMessage(summary.lastProcessedMessageId);
            if (now - message.create_at > maxAge) {
                this.threadSummaries.delete(threadId);
            }
        }
    }

    private async classifyResponse(post: ChatPost, channelType: ResponseType, history?: ChatPost[], params?: HandlerParams): Promise<{ activityType: string, requestedArtifacts: string[], searchQuery: string, searchResults: SearchResult[] }> {
        const artifactList = await this.getArtifactList();
        const availableActions = history ? this.getAvailableActions(ResponseType.RESPONSE) : this.getAvailableActions(ResponseType.CHANNEL);

        const jsonSchema =
        {
            "type": "object",
            "properties": {
                "reasoning": { "type": "string" },
                "activityType": {
                    "type": "string", "enum": availableActions.map(a => a.activityType)
                },
                requestedArtifacts: { type: 'array', items: { type: 'string' }, description: 'List of artifact IDs to retrieve' },
                searchQuery: { type: 'string', description: 'A query to be used for search' }
            },
            "required": ["reasoning", "activityType", "searchQuery"]
        };

        // Get thread summary if there's history
        const threadContext = history ? await this.getThreadSummary(history) : undefined;

        // Format project tasks as markdown
        const projectTasksMarkdown = params?.projects?.map(project => {
            const tasks = Object.values(project.tasks);
            return `
### Project: ${project.name} (${project.id})
${tasks.map(task => `- [${task.complete ? 'x' : ' '}] ${task.description}${task.inProgress ? ' (In Progress)' : ''}`).join('\n')}`;
        }).join('\n') || '';

        let prompt = `Follow these steps:
            1. Consider the ${channelType === ResponseType.RESPONSE ? `thread response` : `new channel message`} you've received.
               ${threadContext ? `\nThread Context:\n${threadContext}` : ''}
               ${projectTasksMarkdown ? `\nCurrent Project Tasks:\n${projectTasksMarkdown}` : ''}
            2. Generate a specific query that should be used to retrieve relevant information for this request.
            3. Here are the possible follow-up activity types to consider:
                    ${availableActions.map(a => ` - ${a.activityType}: ${a.usage}`).join('\n')}
                    - NONE: None of these types fit the request.
            4. Here is the list of available artifacts you can request:
                    ${artifactList}
            5. If you need any specific artifacts, specify their IDs in the requestedArtifacts array.
            6. If you want to search for any additional context across our knowledge base, create a search query.
            7. Respond with the following JSON object:
            {
            "reasoning": "Selected X because of ...",
            "activityType": "X",
            "requestedArtifacts": ["id1", "id2"],
            "searchQuery": ""
            }
        `;

        const response = await this.llmService.generateStructured(post, new StructuredOutputPrompt(jsonSchema, prompt), [], undefined, 1024);


        Logger.info(`Model chose ${response.activityType} because ${response.reasoning}`);

        const searchResults = await this.chromaDBService.query([response.searchQuery], undefined, 10);

        return {
            activityType: response.activityType,
            requestedArtifacts: response.requestedArtifacts || [],
            searchQuery: response.searchQuery,
            searchResults
        };
    }

    private async mapRequestedArtifacts(requestedArtifacts: string[]): Promise<Artifact[]> {
        const artifacts: Artifact[] = [];
        for (const artifactId of requestedArtifacts) {
            try {
                const artifactData = await this.artifactManager.loadArtifact(artifactId);
                if (artifactData) {
                    artifacts.push(artifactData);
                    Logger.info(`Retrieved artifact ${artifactId}: ${artifactData.metadata?.title}`);
                }
            } catch (error) {
                Logger.error(`Failed to retrieve artifact ${artifactId}:`, error);
            }
        }
        return artifacts;
    }

    private async classifyAndRespond(post: ChatPost, responseType: ResponseType, history?: ChatPost[]) {
        // Get all available actions for this response type
        const actions = this.getAvailableActions(responseType);

        // If we only have one handler, use it directly without classification
        if (actions.length === 1) {
            const handlerMethod = responseType === ResponseType.CHANNEL
                ? this.getMethodForActivity(actions[0].activityType)
                : this.getMethodForResponse(actions[0].activityType);

            if (handlerMethod) {
                await handlerMethod({ userPost: post });
                return;
            }
        }

        // Otherwise, proceed with full classification
        const { activityType, requestedArtifacts, searchResults } = await this.classifyResponse(post, responseType, history);
        const artifacts = await this.mapRequestedArtifacts(requestedArtifacts);

        const handlerMethod = this.getMethodForActivity(activityType);
        if (handlerMethod) {
            await handlerMethod({ userPost: post, artifacts, searchResults });
        } else {
            Logger.error(`Unsupported activity type: ${activityType}`);
            await this.reply(post, { message: `Sorry, I don't support ${activityType} yet.` });
        }
    }

    private getMethodForActivity(activityType: string): ((params: HandlerParams) => Promise<void>) | null {
        for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
            const handlerMethod = this[key];
            if (typeof handlerMethod === 'function') {
                const methodActivityType = Reflect.getMetadata('activityType', this, key);
                const methodResponse = Reflect.getMetadata('responseType', this, key);
                if (methodActivityType === activityType && methodResponse === ResponseType.CHANNEL) {
                    return handlerMethod.bind(this);
                }
            }
        }
        return null;
    }

    protected getMethodForResponse(activityType: string): ((params: HandlerParams) => Promise<void>) | null {
        for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
            const handlerMethod = this[key];
            if (typeof handlerMethod === 'function') {
                const methodActivityType = Reflect.getMetadata('activityType', this, key);
                const methodResponse = Reflect.getMetadata('responseType', this, key);
                if (methodActivityType === activityType && methodResponse === ResponseType.RESPONSE) {
                    return handlerMethod.bind(this);
                }
            }
        }
        return null;
    }

    protected getAvailableActions(desiredResponseType: ResponseType): ActionMetadata[] {
        const actions: ActionMetadata[] = []
        for (const key of Object.getOwnPropertyNames(Object.getPrototypeOf(this))) {
            const handlerMethod = this[key];
            if (typeof handlerMethod === 'function') {
                const activityType = Reflect.getMetadata('activityType', this, key);
                const responseType = Reflect.getMetadata('responseType', this, key);
                const usage = Reflect.getMetadata('usage', this, key);
                if (activityType && usage && responseType === desiredResponseType) {
                    actions.push({
                        activityType,
                        usage
                    });
                }
            }
        }
        return actions;
    }

    private async fetchLatestMemoryArtifact(channelId: string): Promise<Artifact | null> {
        return this.modelHelpers.fetchLatestMemoryArtifact(channelId, this.artifactManager);
    }

    private async classifyImportantInformation(channelId: string, history: ChatPost[], previousMemory?: string): Promise<string[]> {
        const llmMessages: { role: string, content: string }[] = [];

        // Add system message explaining the task
        llmMessages.push({
            role: "system",
            content: `You are an AI assistant tasked with analyzing a conversation and identifying key points
            or actions that should be remembered. Focus on remembering information about the user and their intentions.
            Respond with a new complete set of memories you want to keep moving forward as a JSON array of strings, where
            each string is a summary of an important point. Don't keep duplicate information, and limit yourself to 10 or less total.`
        });

        // Add previous memory if available
        if (previousMemory) {
            llmMessages.push({
                role: "system",
                content: `Previous Memory: ${previousMemory}`
            });
        }

        // Add chat history messages
        for (const post of history) {
            const role = post.user_id === this.userId ? "assistant" : "user";
            llmMessages.push({ role: role, content: `${post.message}` });
        }

        // Get the LLM response
        const rawResponse = await this.llmService.sendMessageToLLM(history[history.length - 1].message, llmMessages, undefined, 8192, 512, {
            type: "array",
            items: { type: "string" }
        });

        // Parse the response
        const importantPoints = JSON5.parse(rawResponse);

        Logger.info(`Important points identified in channel ${channelId}:`, importantPoints);
        return importantPoints;
    }
    private async reviseMemoryArtifact(channelId: string, importantPoints: string[], previousMemory?: string): Promise<void> {
        const newMemoryContent = previousMemory ? `${previousMemory}\n${importantPoints.join('\n')}` : importantPoints.join('\n');

        const artifact = {
            id: `${channelId}-${this.userId}-memory`,

            content: newMemoryContent,
            metadata: {
                channel_id: channelId,
                timestamp: Date.now()
            }
        };

        await this.artifactManager.saveArtifact(artifact);

        Logger.info(`Revised memory for channel ${channelId} with important points:`, importantPoints);
    }

    // Convenience method to add a new project
    public async addNewProject({ projectName, tasks, metadata }: {
        projectName: string,
        tasks: {
            description: string;
            type: string;
        }[],
        metadata?: Record<string, any>
    }): Promise<{ projectId: string, taskIds: string[] }> {
        const projectId = randomUUID();
        const project = {
            id: projectId,
            name: projectName,
            tasks: {},
            metadata: metadata
        };

        await this.projects.addProject(project);

        let taskIds: string[] = [];
        if (tasks) {
            for (let task of tasks) {
                const { description, type } = task;
                taskIds.push(await this.addTaskToProject({ projectId, description, type }));
            }
        }

        return { projectId, taskIds };
    }

    // Convenience method to add a task to a project
    public async addTaskToProject({
        projectId,
        description,
        type,
        skipForSameType = true
    }: {
        projectId: string;
        description: string;
        type: string;
        skipForSameType?: boolean;
    }): Promise<string> {
        const project = this.projects.getProject(projectId);

        if (!project) {
            throw new Error(`Project with ID ${projectId} not found.`);
        }

        const existingTask = Object.values(project.tasks).find(t => t.type === type);
        if (!existingTask || !skipForSameType) {
            const taskId = randomUUID();
            const task: Task = {
                id: taskId,
                description: description,
                creator: this.userId,
                projectId: projectId,
                type: type,
                complete: false
            };
            this.projects.addTask(project, task);
            return taskId;
        } else {
            return existingTask.id;
        }
    }

    // Convenience method to save an artifact based on ArtifactResponseSchema
    public async generateArtifactResponse(
        instructions: string,
        params: HandlerParams
    ): Promise<CreateArtifact> {
        // Generate the response
        const response: ArtifactResponseSchema = await this.generateStructured(new StructuredOutputPrompt(
            schemas.definitions.ArtifactResponseSchema,
            new ArtifactInputPrompt(instructions).toString()
        ), params);

        // Prepare the artifact
        const artifact: Artifact = {
            id: randomUUID(),
            type: 'business-goals',
            content: response.artifactContent,
            metadata: {
                title: response.artifactTitle
            }
        };

        // Save the artifact using ArtifactManager
        await this.artifactManager.saveArtifact(artifact);

        return {
            artifactId: artifact.id,
            ...response,
            message: `${response.message} [Document titled "${response.artifactTitle}" has been saved. ID: ${artifact.id}]`
        };
    }

    protected async getMessage(messageId: string): Promise<ChatPost> {
        return this.chatClient.getPost(messageId);
    }
}
