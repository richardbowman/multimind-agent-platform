import JSON5 from "json5";
import { ChatClient, ChatPost, ConversationContext, CreateMessage, Message, ProjectChainResponse } from "src/chat/chatClient";
import Logger from "src/helpers/logger";
import { SystemPromptBuilder } from "src/helpers/systemPrompt";
import { ModelMessageResponse, RequestArtifacts } from "src/schemas/ModelResponse";
import { InputPrompt } from "src/prompts/structuredInputPrompt";
import { Artifact } from "src/tools/artifact";
import { ArtifactManager } from "src/tools/artifactManager";
import { Project, ProjectMetadata, Task, TaskManager, TaskType } from "src/tools/taskManager";
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ILLMService, LLMContext, LLMServices } from 'src/llm/ILLMService';
import { SearchResult, IVectorDatabase } from 'src/llm/IVectorDatabase';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { Settings } from "src/tools/settings";
import { Agents } from "src/utils/AgentLoader";
import { asUUID, createUUID, UUID } from "src/types/uuid";
import { StringUtils } from "src/utils/StringUtils";
import { ContentType, PromptBuilder } from "src/llm/promptBuilder";
import { ChatHandle } from "src/types/chatHandle";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { SchemaType } from "src/schemas/SchemaTypes";
import { ModelType } from "src/llm/types/ModelType";
import { TaskEventType } from "../shared/TaskEventType";


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
    agents: Agents;
}

export interface PlannerParams extends GenerateParams {
    userPost?: Message;
    rootPost?: Message;
    threadPosts?: Message[];
}

export interface GenerateInputParams extends GenerateParams {
    instructions: string | Promise<string> | InputPrompt | StructuredOutputPrompt;
    userPost?: Message;
    threadPosts?: Message[];
    modelType?: ModelType;
    context?: LLMContext;
}

export interface GenerateParams {
    /* @deprecated */
    artifacts?: Artifact[];
    /* @deprecated */
    projects?: Project[];
    /* @deprecated */
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

export abstract class Agent {
    public readonly messagingHandle?: string;
    public readonly userId: UUID;
    public readonly description?: string;
    public supportsDelegation: boolean = false;

    protected readonly chatClient: ChatClient;
    protected readonly threadSummaries: Map<string, ThreadSummary> = new Map();

    /** @deprecated */
    protected readonly llmService: ILLMService;
    protected readonly llmServices: LLMServices;
    protected readonly vectorDBService: IVectorDatabase;
    protected readonly promptBuilder: SystemPromptBuilder;
    protected readonly projects: TaskManager;
    protected readonly artifactManager: ArtifactManager;
    protected readonly modelHelpers: ModelHelpers;
    protected readonly settings: Settings;
    protected readonly agents: Agents;

    protected isWorking: boolean = false;
    protected isMemoryEnabled: boolean = false;

    protected abstract projectCompleted(project: Project): Promise<void>;
    protected abstract processTask(task: Task): Promise<void>;
    protected abstract handlerThread(params: HandlerParams): Promise<void>;
    protected abstract handleChannel(params: HandlerParams): Promise<void>;

    public abstract onReady?(): Promise<void>;

    constructor(params: AgentConstructorParams) {
        this.chatClient = params.chatClient;
        this.llmService = params.llmService;
        this.llmServices = params.llmServices;
        this.userId = params.userId;
        this.vectorDBService = params.vectorDBService;
        this.projects = params.taskManager;
        this.messagingHandle = params.messagingHandle;
        this.settings = params.settings;
        this.agents = params.agents;
        this.description = params.description;

        this.modelHelpers = new ModelHelpers({
            llmService: params.llmService,
            llmServices: params.llmServices,
            userId: params.userId,
            messagingHandle: params.messagingHandle,
            context: this.buildLLMContext()
        });

        this.promptBuilder = new SystemPromptBuilder();
        this.artifactManager = params.artifactManager;

        if (this.projects) {
            this.projects.on("taskAssigned", async ({ task } : { task: Task }) => {
                if (task.assignee === this.userId || task.creator === this.userId) {
                    await this.taskNotification(task, TaskEventType.Assigned);
                }
            });
            this.projects.on("taskCompleted", async ({ task } : { task: Task }) => {
                if (task.assignee === this.userId || task.creator === this.userId) {
                    await this.taskNotification(task, TaskEventType.Completed);
                }
            });

            this.projects.on("projectCompleted", async (event) => {
                if (event.creator === this.userId) {
                    await this.projectCompleted(event.project);
                }
            });

            this.projects.on("taskReady", async (event) => {
                if (event.task.assignee === this.userId || event.task.creator === this.userId) {
                    await this.taskNotification(event.task, TaskEventType.Ready);
                }
            });

            this.projects.on("taskCancelled", async ({ task } : { task: Task }) => {
                if (task.assignee === this.userId || task.creator === this.userId) {
                    await this.taskNotification(task, TaskEventType.Cancelled);
                }
            });


            if (params.messagingHandle) this.chatClient.registerHandle(params.messagingHandle);
            this.chatClient.onAddedToChannel((channelId, channelParams) => {
                this.setupChatMonitor(channelId, params.messagingHandle, channelParams.defaultResponderId === this.userId);
            })
        } else {
            Logger.warn(`Agent ${this.constructor.name} didn't provide access to task manager`);
        }
    }

    public async initialize(): Promise<void> {
        this.processTaskQueue();
    }


    protected buildLLMContext(): LLMContext {
        return {
            agentId: this.userId
        }
    }

    protected async taskNotification(task: Task, eventType: TaskEventType): Promise<void> {
        try {
            const isMine = task.assignee === this.userId;
            Logger.info(`Agent [${this.messagingHandle}]: Received task notification '${eventType}': ${task.description} [${isMine ? "MINE" : "CREATOR"}]}]`);

            // when tasks are assigned to me, start working on them; also for completed async tasks we need to kickoff queue
            if (isMine && task.type === TaskType.Standard) {
                await this.processTaskQueue();
            }
        } catch (error) {
            Logger.error("failure in task notification", error);
        }
    }

    async processTaskQueue(): Promise<void> {
        if (this.isWorking) {
            Logger.info(`Agent [${this.messagingHandle}]: Task queue is already being processed`);
            return;
        }

        this.isWorking = true;
        let processedCount = 0;

        try {
            while (true) {
                const task = await this.projects.getNextTaskForUser(this.userId);
                if (!task) {
                    Logger.info(`Agent [${this.messagingHandle}]: Task queue processing complete. Processed ${processedCount} tasks.`);
                    return;
                }

                Logger.info(`Agent [${this.messagingHandle}]: Processing task ${task.id}: ${task.description}`);
                try {
                    // Mark task as in progress before starting
                    await this.projects.markTaskInProgress(task);

                    // Attempt to process the task
                    await this.processTask(task);

                    const latestTask = await this.projects.getTaskById(task.id);
                    if (!latestTask?.complete) {
                        Logger.info(`Agent [${this.messagingHandle}]: Current task is not yet complete. Processed ${processedCount} tasks, exiting processing queue.`);
                        continue;
                    }

                    processedCount++;
                } catch (error) {
                    // If task fails, leave it in progress but log the error
                    Logger.error(`Agent [${this.messagingHandle}]: Failed to process task ${task.id}:`, error);
                    // Re-throw to stop processing queue on error
                    throw error;
                }
            }
        } finally {
            this.isWorking = false;
        }
    }

    public getPurpose(): string {
        return this.modelHelpers.getPurpose();
    }

    public setPurpose(purpose: string, finalInstructions?: string) {
        this.modelHelpers.setPurpose(purpose)
        if (finalInstructions) this.modelHelpers.setFinalInstructions(finalInstructions);
    }

    protected enableMemory(): void {
        this.isMemoryEnabled = true;
        this.modelHelpers.enableMemory();
    }

    protected async send(post: CreateMessage, channelId: UUID): Promise<ChatPost | null> {
        try {
            // Assuming you have a chatClient or similar service to send messages to the channel
            return await this.chatClient.postInChannel(channelId, post.message, post.props);
            Logger.info(`Agent [${this.messagingHandle}]: Message sent to channel ${channelId}: ${post.message}`);
        } catch (error) {
            Logger.error(`Agent [${this.messagingHandle}]: Failed to send message to channel ${channelId}:`, error);
            return null;
        }
    }

    protected async reply(post: ChatPost, response: RequestArtifacts, postProps?: ConversationContext): Promise<ChatPost> {
        if (!response || !response.message) {
            throw new Error("Invalid message provided in reply");
        }

        const artifactIds = [...postProps?.artifactIds || [], ...response.artifactIds || [], ...response.artifactId ? [response.artifactId] : []];

        // Include project ID in props if present in response
        const responseProps = {
            ...postProps,
            artifactIds,
            ...(response.projectId && { "project-ids": [response.projectId] })
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
    protected async fetchMessages(channelId: UUID): Promise<ChatPost[]> {
        return await this.chatClient.fetchPreviousMessages(channelId);
    }

    public async setupChatMonitor(monitorChannelId: UUID, handle?: ChatHandle, autoRespond?: boolean) {
        Logger.verbose(`REGISTRATION ${monitorChannelId}: ${handle}`)

        // Initialize the WebSocket client for real-time message listening
        this.chatClient.receiveMessages(async (post: ChatPost) => {
            // Get the channel ID and user ID
            const channelId = post.channel_id;
            const userId = post.user_id;

            if (monitorChannelId === channelId && userId !== this.userId) {
                Logger.verbose(`Received message: ${StringUtils.truncateWithEllipsis(post.message, 100)} in ${channelId} from ${userId}, with root id ${post.getRootId()}`);

                let context: ConversationContext | undefined;

                if (!post.getRootId() && (handle && post.message.startsWith(handle + " ") || (!post.message.startsWith("@") && autoRespond))) {
                    let requestedArtifacts: string[] = [], searchResults: SearchResult[] = [];

                    const allArtifacts = [...new Set([...requestedArtifacts, ...post.props.artifactIds || []].flat().filter(a => !!a))];
                    const artifacts = await this.mapRequestedArtifacts(allArtifacts.map(a => asUUID(a)));

                    await this.handleChannel({ userPost: post, artifacts: artifacts, agents: this.agents });
                } else if (post.getRootId()) {
                    const postRootId: string = post.getRootId() || "";

                    Logger.verbose(`Received thread message: ${post.message} in ${channelId} from ${userId}, with root id ${postRootId}`);

                    const posts = await this.chatClient.getThreadChain(post);
                    // continue responding to chats i initally responded to, but don't respond to myself
                    if (posts.length > 1 && posts[1].user_id === this.userId && post.id !== this.userId) {
                        // Get all available actions for this response type
                        const projectIds = [...new Set(posts.map(p => p.props["project-ids"] || []).flat().filter(id => id !== undefined))];
                        const projects: Project[] = [];
                        for (const projectId of projectIds) {
                            const project = await this.projects.getProject(projectId);
                            if (project) projects.push(project);
                        }

                        let requestedArtifacts: UUID[] = [], searchResults: SearchResult[] = [];

                        const allArtifacts = [...new Set([...requestedArtifacts, ...posts.map(p => p.props["artifactIds"])].flat().flat().filter(a => !!a))];
                        const artifacts = await this.mapRequestedArtifacts(allArtifacts.map(a => asUUID(a)));

                        this.handlerThread({
                            userPost: post,
                            rootPost: posts[0],
                            artifacts,
                            projects,
                            threadPosts: posts.slice(1, -1),
                            searchResults,
                            agents: this.agents
                        });
                    }
                }
            } else {
                // Logger.info(`Ignoring message: ${post.message} in ${channelId} from ${userId}, with root id ${post.root_id}`);
            }
        });

        // Check if welcome message exists in channel
        const channelMessages = await this.chatClient.fetchPreviousMessages(monitorChannelId, 50);
        const existingWelcome = channelMessages.find(c => c.props.messageType === 'welcome');

        if (!existingWelcome || existingWelcome.props.partial) {
            // Get channel data to find available agents
            const channelData = await this.chatClient.getChannelData(monitorChannelId);

            // Only send welcome if we're the default responder
            if (channelData.defaultResponderId === this.userId) {
                const allAgents = Object.values(this.agents.agents);

                const channelAgents = (channelData.members || [])
                    .map(memberId => this.agents.agents[memberId]);

                let post;
                if (existingWelcome) {
                    post = await this.chatClient.updatePost(existingWelcome.id, 'Typing...', { partial: true });
                } else {
                    post = await this.send({ message: "Typing...", props: { partial: true, messageType: 'welcome' } }, monitorChannelId);
                }
            
                if (!post) {
                    Logger.error("Failed to create post for welcome message");
                } else {
                    const welcomeMessage = `@user ${await this.generateWelcomeMessage(channelAgents, allAgents, monitorChannelId)}`;
                    await this.chatClient.updatePost(post.id, welcomeMessage, { partial: false });
                }
            }
        }
    }

    private async generateWelcomeMessage(agentOptions: Agent[], allAgents: Agent[], channelId: UUID): Promise<string> {
        const channel = await this.chatClient.getChannelData(channelId);
        const channelProject = channel?.projectId
            ? await this.projects.getProject(channel.projectId)
            : null;
        const channelGoals = [
            ...Object.values(channelProject?.tasks || {})
        ]

        const instructions = this.modelHelpers.createPrompt();
        instructions.addContext({ contentType: ContentType.ABOUT });
        instructions.addContext({ contentType: ContentType.CHANNEL_DETAILS, channel, tasks: channelGoals });
        instructions.addContext({ contentType: ContentType.PURPOSE });
        if (channel.name === "#welcome") {
            instructions.addContext({ contentType: ContentType.ALL_AGENTS, agents: allAgents });
        } else {
            instructions.addContext({ contentType: ContentType.CHANNEL_AGENT_CAPABILITIES, agents: agentOptions });
        }
        instructions.addInstruction(`Generate a welcome message for a new chat channel that:
1. Introduces yourself
2. Briefly explains how you help users achieve their goals
3. Explains the agent(s) available to help them
4. Invites them to share what they'd like to achieve

Do not make information up.`);

        const response = await this.modelHelpers.generate({
            message: "Generate a welcome message to the chat channel.",
            instructions: instructions
        });

        return response.message;
    }

    // @deprecated
    protected async generateStructured(structure: StructuredOutputPrompt, params: GenerateParams): Promise<ModelMessageResponse> {
        return this.modelHelpers.generate({
            instructions: structure,
            ...params
        });
    }

    protected async generate(params: GenerateInputParams): Promise<ModelMessageResponse> {
        return this.modelHelpers.generate(params);
    }

    protected async mapRequestedArtifacts(requestedArtifacts: UUID[]): Promise<Artifact[]> {
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
        await this.artifactManager.saveArtifact({
            type: 'memory',
            content: newMemoryContent,
            metadata: {
                channel_id: channelId,
                timestamp: Date.now()
            }
        });

        Logger.info(`Revised memory for channel ${channelId} with important points:`, importantPoints);
    }

    // Convenience method to add a new project
    public async addNewProject({ projectName, tasks, metadata }: {
        projectName: string;
        tasks: {
            description: string;
            type: TaskType;
        }[];
        metadata?: Partial<ProjectMetadata>
    }): Promise<{ projectId: UUID, taskIds: UUID[] }> {
        const project = await this.projects.createProject({
            name: projectName,
            tasks: tasks,
            metadata: metadata
        });

        // Get the task IDs from the created project
        const taskIds = Object.values(project.tasks).map(t => t.id);

        return { projectId: project.id, taskIds };
    }

    protected async getMessage(messageId: UUID): Promise<ChatPost | undefined> {
        return this.chatClient.getPost(messageId);
    }
}
