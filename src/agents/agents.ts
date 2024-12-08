import { randomUUID } from 'crypto';
import JSON5 from "json5";
import { Handler } from "puppeteer";
import { ChatClient, ChatPost, ConversationContext, Message, ProjectChainResponse } from "src/chat/chatClient";
import Logger from "src/helpers/logger";
import { SystemPromptBuilder } from "src/helpers/systemPrompt";
import ChromaDBService, { SearchResult } from "src/llm/chromaService";
import LMStudioService, { StructuredOutputPrompt } from "src/llm/lmstudioService";
import { CreateArtifact, ModelResponse, RequestArtifacts } from "src/agents/schemas/ModelResponse";
import { StructuredInputPrompt } from "src/prompts/structuredInputPrompt";
import { Artifact } from "src/tools/artifact";
import { ArtifactManager } from "src/tools/artifactManager";
import { Project, Task, TaskManager } from "src/tools/taskManager";
import { ArtifactResponseSchema } from './schemas/artifactSchema';
import schemas from './schemas/schema.json';
import { ArtifactInputPrompt } from 'src/prompts/artifactInputPrompt';

export interface ActionMetadata {
    activityType: string;
    usage: string;
}

export enum ResponseType {
    RESPONSE,
    CHANNEL
}

export interface HandlerParams {
    userPost: ChatPost;
    artifacts?: Artifact[];
    projects?: Project<Task>[];
    rootPost?: ChatPost;
    threadPosts?: ChatPost[];
    searchResults: SearchResult[]
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

export abstract class Agent<Project, Task> {
    private chatClient: ChatClient;
    private isMemoryEnabled: boolean = false;

    protected lmStudioService: LMStudioService;
    protected userId: string;
    protected chromaDBService: ChromaDBService;
    protected promptBuilder: SystemPromptBuilder;
    protected projects: TaskManager;
    protected purpose: String = 'You are a helpful agent.';
    protected artifactManger: ArtifactManager;

    protected abstract taskNotification(task: Task): void;
    protected abstract projectCompleted(project: Project): void;


    constructor(chatClient: ChatClient, lmStudioService: LMStudioService, userId: string, projects: TaskManager, chromaDBService?: ChromaDBService) {
        this.chatClient = chatClient;
        this.lmStudioService = lmStudioService;
        this.userId = userId;
        this.chromaDBService = chromaDBService || new ChromaDBService(lmStudioService);
        this.promptBuilder = new SystemPromptBuilder();
        this.artifactManger = new ArtifactManager(this.chromaDBService);
        this.projects = projects;

        this.projects.on("taskAssigned", async (event) => {
            if (event.assignee === this.userId) {
                await this.taskNotification(event.task);
            }
        });
        this.projects.on("projectCompleted", async (event) => {
            if (event.creator === this.userId) {
                await this.projectCompleted(event.project);
            }
        })
    }

    public setPurpose(purpose: string) {
        this.purpose = purpose;
    }

    protected enableMemory() {
        this.isMemoryEnabled = true;
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

    protected async reply(post: ChatPost, response: ModelResponse, postProps?: ConversationContext): Promise<ChatPost> {
        const artifactIds = [...postProps?.["artifact-ids"] || [], ...response.artifactIds || [], ...response.artifactId?[response.artifactId]:[]];

        const reply = await this.chatClient.replyThreaded(post, response.message, {
            ...postProps,
            "artifact-ids": artifactIds
        });


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
                    await this.classifyAndRespond(post, ResponseType.CHANNEL);
                } else if (post.getRootId()) {
                    const postRootId: string = post.getRootId() || "";

                    Logger.verbose(`Received thread message: ${post.message} in ${channelId} from ${userId}, with root id ${postRootId}`);

                    const projectChain = await this.chatClient.findProjectChain(post.channel_id, postRootId);
                    if (projectChain && projectChain.activityType) {
                        const originalActivityType = projectChain.activityType;

                        if (!this.getMethodForActivity(originalActivityType)) {
                            Logger.verbose("skipping processing, not a child thread of our activity types");
                            return;
                        }

                        // Determine the type of activity using an LLM
                        const { activityType, requestedArtifacts, searchResults } = await this.classifyResponse(post, ResponseType.RESPONSE, projectChain.posts);

                        const allArtifacts = [...new Set([...requestedArtifacts, ...projectChain.posts.map(p => p.props["artifact-ids"] || [])].flat())];
                        const artifacts = await this.mapRequestedArtifacts(allArtifacts);

                        // Retrieve the method based on the activity type
                        const handlerMethod = this.getMethodForResponse(activityType);
                        if (handlerMethod) {
                            await handlerMethod({
                                userPost: post,
                                artifacts,
                                projectChain,
                                searchResults
                            });
                        } else {
                            Logger.info(`Unsupported activity type: ${activityType}`);
                            await this.reply(post, `Sorry, I don't support ${activityType} yet.`);
                        }
                    } else {
                        const posts = await this.chatClient.getThreadChain(post);
                        // only respond to chats directed at "me"
                        if (posts[0].message.startsWith(handle)) {
                            const { activityType, requestedArtifacts, searchResults } = await this.classifyResponse(post, ResponseType.RESPONSE, posts);

                            const allArtifacts = [...new Set([...requestedArtifacts, ...posts.map(p => p.props["artifact-ids"] || [])].flat())];
                            const artifacts = await this.mapRequestedArtifacts(allArtifacts);

                            const projectIds = posts.map(p => p.props["project-id"]).filter(id => id !== undefined);
                            const projects = [];
                            for (const projectId of projectIds) {
                                const project = this.projects.getProject(projectId);
                                if (project) projects.push(project);
                            }

                            // Retrieve the method based on the activity type
                            const handlerMethod = this.getMethodForResponse(activityType);
                            if (handlerMethod) {
                                await handlerMethod({
                                    userPost: post,
                                    rootPost: posts[0],
                                    artifacts,
                                    projects,
                                    threadPosts: posts.slice(1),
                                    searchResults
                                });
                            } else {
                                Logger.info(`Unsupported activity type: ${activityType}`);
                                await this.reply(post, {
                                    message: `Sorry, I don't support ${activityType} yet.`
                                });
                            }
                        }
                    }
                }
            } else {
                // Logger.info(`Ignoring message: ${post.message} in ${channelId} from ${userId}, with root id ${post.root_id}`);
            }
        });
    }

    protected async generateStructured(structure: StructuredOutputPrompt, params: HandlerParams): Promise<ModelResponse> {
        // Fetch the latest memory artifact for the channel
        let augmentedInstructions = structure.getPrompt();
        if (this.isMemoryEnabled) {
            const memoryArtifact = await this.fetchLatestMemoryArtifact(params.userPost.channel_id);

            // Append the memory content to the instructions if it exists
            if (memoryArtifact && memoryArtifact.content) {
                const memoryContent = memoryArtifact.content.toString();
                augmentedInstructions += `\n\nContext from previous interactions:\n${memoryContent}`;
            }
        }

        // Deduplicate artifacts first, then search results
        const deduplicatedArtifacts = params.artifacts ? this.deduplicateArtifacts(params.artifacts) : [];
        const deduplicatedSearchResults = params.searchResults ? this.deduplicateSearchResults(params.searchResults, deduplicatedArtifacts) : undefined;

        if (deduplicatedSearchResults) {
            augmentedInstructions += `\n\nSearch results from knowledge base:\n${deduplicatedSearchResults.map(s => `<searchresult>Result ID: ${s.id}\nResult Title:${s.metadata.title}\nResult Content:\n${s.text}</searchresult>\n\n`)}`;
        }

        if (deduplicatedArtifacts) {
            for (const artifact of deduplicatedArtifacts) {
                const artifactContent = artifact.content ? artifact.content.toString() : 'No content available';
                augmentedInstructions += `\n\n<artifact>Artifact ID: ${artifact.id}\nTitle: ${artifact.metadata?.title || 'No title'}\nContent:\n${artifactContent}</artifact>`;
            }
        }

        // Augment instructions with context and generate a response
        const history = params.threadPosts || params.projectChain?.posts.slice(0, -1) || [];

        const augmentedStructuredInstructions = new StructuredOutputPrompt(structure.getSchema(), augmentedInstructions);

        const response = await this.lmStudioService.generateStructured(params.userPost, augmentedStructuredInstructions, history);
        response.artifactIds = params.artifacts?.map(a => a.id);
        return response;
    }

    protected async generate(instructions: string, params: HandlerParams): Promise<ModelResponse> {
        // Fetch the latest memory artifact for the channel
        let augmentedInstructions = `AGENT PURPOSE: ${this.purpose}\n\nINSTRUCTIONS: ${instructions}`;

        if (this.isMemoryEnabled) {
            const memoryArtifact = await this.fetchLatestMemoryArtifact(params.userPost.channel_id);

            // Append the memory content to the instructions if it exists
            if (memoryArtifact && memoryArtifact.content) {
                const memoryContent = memoryArtifact.content.toString();
                augmentedInstructions += `\n\nContext from previous interactions:\n${memoryContent}`;
            }
        }

        // Deduplicate artifacts first, then search results
        const deduplicatedArtifacts = params.artifacts ? this.deduplicateArtifacts(params.artifacts) : [];
        const deduplicatedSearchResults = params.searchResults ? this.deduplicateSearchResults(params.searchResults, deduplicatedArtifacts) : undefined;

        if (deduplicatedSearchResults) {
            augmentedInstructions += `\n\nSearch results from knowledge base:\n${deduplicatedSearchResults.map(s => `<searchresult>Result ID: ${s.id}\nResult Title:${s.metadata.title}\nResult Content:\n${s.text}</searchresult>\n\n`)}`;
        }

        if (deduplicatedArtifacts) {
            for (const artifact of deduplicatedArtifacts) {
                const artifactContent = artifact.content ? artifact.content.toString() : 'No content available';
                augmentedInstructions += `\n\n<artifact>Artifact ID: ${artifact.id}\nTitle: ${artifact.metadata?.title || 'No title'}\nContent:\n${artifactContent}</artifact>`;
            }
        }

        // Augment instructions with context and generate a response
        const history = params.threadPosts || params.projectChain?.posts.slice(0, -1) || [];

        const response = await this.lmStudioService.generate(augmentedInstructions, params.userPost, history);
        response.artifactIds = params.artifacts?.map(a => a.id);
        return response;
    }

    private deduplicateArtifacts(artifacts: Artifact[]): Artifact[] {
        const seenArtifacts = new Set<string>();
        return artifacts.filter(artifact => {
            const { id: artifactId } = artifact;
            if (seenArtifacts.has(artifactId)) {
                return false;
            }
            seenArtifacts.add(artifactId);
            return true;
        });
    }

    private deduplicateSearchResults(searchResults: SearchResult[], artifacts: Artifact[]): SearchResult[] {
        const seenChunks = new Set<string>();
        const artifactUrls = new Set<string>(artifacts.map(a => `artifact://${a.id}`));

        return searchResults.filter(result => {
            if (seenChunks.has(result.id)) {
                return false;
            }
            if (artifactUrls.has(result.metadata.url)) {
                return false;
            }

            seenChunks.add(result.id);
            return true;
        });
    }

    private async getArtifactList(): Promise<string> {
        const artifacts = await this.artifactManger.listArtifacts();
        const filteredArtifacts = artifacts.filter(a => a.metadata?.title?.length > 0 && !a.id.includes('memory'))
        return filteredArtifacts.map(artifact => ` - ${artifact.id}: ${artifact.metadata?.title}`).join('\n');
    }

    private async classifyResponse(post: ChatPost, channelType: ResponseType, history?: ChatPost[]): Promise<{ activityType: string, requestedArtifacts: string[], searchQuery: string, searchResults: SearchResult[] }> {
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

        let prompt = `Follow these steps:
            1. Consider the ${channelType === ResponseType.RESPONSE ? `thread response` : `new channel message`} you've received 
               ${channelType === ResponseType.RESPONSE ? `and any preceding messages in the thread (if applicable)` : ``}. What is it asking for or confirming?
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

        let llmMessages: { role: string, content: string }[] = [];
        llmMessages.push({ role: "system", content: prompt });

        if (history) {
            history.forEach((chatPost, index) => {
                const role = chatPost.user_id === this.userId ? "assistant" : "user";
                llmMessages.push({ role: role, content: `${index + 1}. ${chatPost.message}` });
            });
        }

        // Add the current post to the history
        llmMessages.push({ role: "user", content: post.message });

        const rawResponse = await this.lmStudioService.sendMessageToLLM(post.message, llmMessages, undefined, 8192, 256, jsonSchema);
        const response = JSON5.parse(rawResponse);

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
                const artifactData = await this.artifactManger.loadArtifact(artifactId);
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
        const artifact = await this.artifactManger.loadArtifact(`${channelId}-${this.userId}-memory`);
        return artifact;
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
        const rawResponse = await this.lmStudioService.sendMessageToLLM(history[history.length - 1].message, llmMessages, undefined, 8192, 512, {
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

        await this.artifactManger.saveArtifact(artifact);

        Logger.info(`Revised memory for channel ${channelId} with important points:`, importantPoints);
    }

    // Convenience method to add a new project
    public async addNewProject({ projectName, tasks }: {
        projectName: string, tasks: {
            description: string;
            type: string;
        }[]
    }): Promise<{ projectId: string, taskIds: string[]}> {
        const projectId = randomUUID();
        const project = {
            id: projectId,
            name: projectName,
            tasks: {}
        };

        this.projects.addProject(project);

        let taskIds : string[] = [];
        if (tasks) {
            for(let task of tasks) {
                const { description, type } = task;
                taskIds.push(await this.addTaskToProject({projectId, description, type}));
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
        await this.artifactManger.saveArtifact(artifact);

        return {
            artifactId: artifact.id,
            ...response,
            message:  `${response.message} [Document titled "${response.artifactTitle}" has been saved. ID: ${artifact.id}]`
        };
    }

    protected async getMessage(messageId: string) : Promise<ChatPost> {
        return this.chatClient.getPost(messageId);
    }
}