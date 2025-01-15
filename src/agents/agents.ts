import JSON5 from "json5";
import { ChatClient, ChatPost, ConversationContext, Message, ProjectChainResponse } from "src/chat/chatClient";
import Logger from "src/helpers/logger";
import { SystemPromptBuilder } from "src/helpers/systemPrompt";
import { ModelMessageResponse } from "src/schemas/ModelResponse";
import { InputPrompt } from "src/prompts/structuredInputPrompt";
import { Artifact } from "src/tools/artifact";
import { ArtifactManager } from "src/tools/artifactManager";
import { Project, ProjectMetadata, Task, TaskManager } from "src/tools/taskManager";
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ILLMService } from 'src/llm/ILLMService';
import { SearchResult, IVectorDatabase } from 'src/llm/IVectorDatabase';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { Settings } from "src/tools/settings";

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

export interface PlannerParams extends GenerateParams {
    userPost: Message;
    rootPost?: Message;
    threadPosts?: Message[];
}

export interface GenerateInputParams extends GenerateParams {
    instructions: string | InputPrompt | StructuredOutputPrompt;
    threadPosts?: Message[];
    model?: string;
}

export interface GenerateParams {
    artifacts?: Artifact[];
    projects?: Project[];
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
    private readonly chatClient: ChatClient;
    private readonly threadSummaries: Map<string, ThreadSummary> = new Map();
    private readonly messagingHandle?: string;

    protected readonly llmService: ILLMService;
    protected readonly userId: string;
    protected readonly chromaDBService: IVectorDatabase;
    protected readonly promptBuilder: SystemPromptBuilder;
    protected readonly projects: TaskManager;
    protected readonly artifactManager: ArtifactManager;
    protected readonly modelHelpers: ModelHelpers;
    protected readonly settings: Settings;

    protected isWorking: boolean = false;
    protected isMemoryEnabled: boolean = false;

    protected abstract projectCompleted(project: Project): void;
    protected abstract processTask(task: Task): Promise<void>;
    protected abstract handlerThread(params: HandlerParams): Promise<void>;
    protected abstract handleChannel(params: HandlerParams): Promise<void>;

    constructor(params: AgentConstructorParams) {
        this.chatClient = params.chatClient;
        this.llmService = params.llmService;
        this.userId = params.userId;
        this.chromaDBService = params.vectorDBService;
        this.projects = params.taskManager;
        this.messagingHandle = params.messagingHandle;
        this.settings = params.settings;
        
        this.modelHelpers = new ModelHelpers(this.llmService, this.userId);
        this.promptBuilder = new SystemPromptBuilder();
        this.artifactManager = params.artifactManager || new ArtifactManager(this.chromaDBService);

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

            
            if (params.messagingHandle) this.chatClient.registerHandle(params.messagingHandle);
            this.chatClient.onAddedToChannel((channelId, channelParams) => {
                this.setupChatMonitor(channelId, params.messagingHandle, channelParams.defaultResponderId === this.userId);
            })
        } else {
            Logger.warn(`Agent ${this.constructor.name} didn't provide access to task manager`);
        }
    }

    public abstract initialize?(): Promise<void>;

    protected async taskNotification(task: Task): Promise<void> {
        await this.processTaskQueue();
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
                const task = await this.projects.getNextTaskForUser(this.userId);
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

    protected enableMemory(): void {
        this.isMemoryEnabled = true;
        this.modelHelpers.enableMemory();
    }

    protected async send(post: Message, channelId: string): Promise<void> {
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

    public setupChatMonitor(monitorChannelId: string, handle?: string, autoRespond?: boolean) {
        Logger.verbose(`REGISTRATION ${monitorChannelId}: ${handle}`)

        // Initialize the WebSocket client for real-time message listening
        this.chatClient.receiveMessages(async (post: ChatPost) => {
            // Get the channel ID and user ID
            const channelId = post.channel_id;
            const userId = post.user_id;

            if (monitorChannelId === channelId && userId !== this.userId) {
                Logger.verbose(`Received message: ${post.message.slice(0, 100)}... in ${channelId} from ${userId}, with root id ${post.getRootId()}`);

                let context: ConversationContext | undefined;

                if (!post.getRootId() && (handle && post.message.startsWith(handle + " ") || (!post.message.startsWith("@") && autoRespond))) {
                    let requestedArtifacts: string[] = [], searchResults: SearchResult[] = [];

                    const allArtifacts =    [...new Set([...requestedArtifacts, ...post.props["artifact-ids"]||[]].flat())];
                    const artifacts = await this.mapRequestedArtifacts(allArtifacts);

                    await this.handleChannel({ userPost: post, artifacts: artifacts });
                } else if (post.getRootId()) {
                    const postRootId: string = post.getRootId() || "";

                    Logger.verbose(`Received thread message: ${post.message} in ${channelId} from ${userId}, with root id ${postRootId}`);

                    const posts = await this.chatClient.getThreadChain(post);
                    // continue responding to chats i initally responded to
                    if (posts.length > 1 && posts[1].user_id === this.userId) {
                        // Get all available actions for this response type
                        const projectIds = posts.map(p => p.props["project-id"]).filter(id => id !== undefined);
                        const projects : Project[] = [];
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

        const artifact: Artifact = {
            id: `${channelId}-${this.userId}-memory`,
            type: 'memory',
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
        projectName: string;
        tasks: {
            description: string;
            type: string;
        }[];
        metadata?: Partial<ProjectMetadata>
    }): Promise<{ projectId: string, taskIds: string[] }> {
        const project = await this.projects.createProject({
            name: projectName,
            tasks: tasks,
            metadata: metadata
        });
        
        // Get the task IDs from the created project
        const taskIds = Object.values(project.tasks).map(t => t.id);
        
        return { projectId: project.id, taskIds };
    }

    protected async getMessage(messageId: string): Promise<ChatPost | undefined> {
        return this.chatClient.getPost(messageId);
    }
}
