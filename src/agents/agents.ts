import JSON5 from "json5";
import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from "src/chat/chatClient";
import Logger from "src/helpers/logger";
import { SystemPromptBuilder } from "src/helpers/systemPrompt";
import ChromaDBService from "src/llm/chromaService";
import LMStudioService from "src/llm/lmstudioService";
import { Task, TaskManager } from "src/tools/taskManager";

export interface ActionMetadata {
    activityType: string;
    usage: string;
}

export enum ResponseType { 
    RESPONSE,
    CHANNEL
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
    protected chatClient: ChatClient;
    protected lmStudioService: LMStudioService;
    protected userId: string;
    protected chromaDBService: ChromaDBService;
    protected promptBuilder: SystemPromptBuilder;
    protected projects: TaskManager;

    constructor(chatClient: ChatClient, lmStudioService: LMStudioService, userId: string, projects: TaskManager) {
        this.chatClient = chatClient;
        this.lmStudioService = lmStudioService;
        this.userId = userId;
        this.chromaDBService = new ChromaDBService(lmStudioService);
        this.promptBuilder = new SystemPromptBuilder();
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

    protected abstract taskNotification(task: Task) : void;
    protected abstract projectCompleted(project: Project) : void;

    // Common method for sending messages
    protected async sendMessage(channelId: string, message: string, postProps?: ConversationContext): Promise<ChatPost> {
        return await this.chatClient.createPost(channelId, message, postProps);
    }

    // Common method for fetching previous messages
    protected async fetchMessages(channelId: string): Promise<ChatPost[]> {
        return await this.chatClient.fetchPreviousMessages(channelId);
    }

    public async setupChatMonitor(monitorChannelId: string, handle: string) {
        this.chatClient.registerHandle(handle);
        
        // Initialize the WebSocket client for real-time message listening
        this.chatClient.initializeWebSocket(async (post: ChatPost) => {
            // Get the channel ID and user ID
            const channelId = post.channel_id;
            const userId = post.user_id;

            if (monitorChannelId === channelId && userId !== this.userId) {
                Logger.info(`Received message: ${post.message.slice(0,100)}... in ${channelId} from ${userId}, with root id ${post.getRootId()}`);

                let context: ConversationContext | undefined;

                if (!post.getRootId() && post.message.startsWith(handle)) {
                    // Determine the type of activity using an LLM
                    const activityType = await this.classifyActivity(post);
                    
                    // Retrieve the method based on the activity type
                    const handlerMethod = this.getMethodForActivity(activityType);
                    if (handlerMethod) {
                        await handlerMethod(channelId, post);
                    } else {
                        Logger.error(`Unsupported activity type: ${activityType}`);
                        await this.chatClient.createPost(channelId, `Sorry, I don't support ${activityType} yet.`, {});
                    }
                } else if (post.getRootId()) {
                    const postRootId : string = post.getRootId()||"";
                    
                    Logger.info(`Received thread message: ${post.message} in ${channelId} from ${userId}, with root id ${postRootId}`);

                    const projectChain = await this.chatClient.findProjectChain(post.channel_id, postRootId);
                    const originalActivityType = projectChain.activityType;

                    if (!this.getMethodForActivity(originalActivityType)) {
                        Logger.info("skipping processing, not a child thread of our activity types");
                        return;
                    }

                    // Determine the type of activity using an LLM
                    const followupActivityType = await this.classifyThreadResponse(post, projectChain);

                    // Retrieve the method based on the activity type
                    const handlerMethod = this.getMethodForResponse(followupActivityType);
                    if (handlerMethod) {
                        await handlerMethod(channelId, post, projectChain);
                    } else {
                        Logger.info(`Unsupported activity type: ${followupActivityType}`);
                        await this.chatClient.postReply(postRootId, channelId, `Sorry, I don't support ${followupActivityType} yet.`, {});
                    }
                }
            } else {
                // Logger.info(`Ignoring message: ${post.message} in ${channelId} from ${userId}, with root id ${post.root_id}`);
            }
        });
    }

    private async classifyActivity(post: ChatPost): Promise<string> {
        // if (post.props['activity-type']) {
        //     return post.props['activity-type'];
        // } else {
            const prompt = `Follow these steps:
1. Consider the message you've received. What is it asking for?
2. Looking at this list, classify what type of message the agent just recevied:
                ${this.getAvailableActions(ResponseType.CHANNEL).map(a => ` - ${a.activityType}: ${a.usage}`).join('\n')}
                - NONE: None of these types fit the request.

3. Choose the best fitting activity type. Respond with the following JSON object:
    {
        "reasoning": "Selected X because of ...",
        "activityType": "X"
    }
`;
            // Logger.info(prompt);s
            
            const history = [{ role: "system", content: prompt }]; // Initialize history with the prompt
            const rawResponse = await this.lmStudioService.sendMessageToLLM(post.message, history, "{");
            const response = JSON5.parse(rawResponse);
            Logger.info(`Model chose ${response.activityType} because ${response.reasoning}`);
            return response.activityType;
        // }
    }

    private async classifyThreadResponse(post: ChatPost, projectChain: ProjectChainResponse): Promise<string> {
        const jsonSchema = 
            {
                "type": "object",
                "properties": {
                    "reasoning": { "type": "string" },
                    "activityType": { "type": "string", "enum": 
                        this.getAvailableActions(ResponseType.RESPONSE).map(a => a.activityType)
                    }
                },
                "required": ["reasoning", "activityType"]
            };

        const prompt = `
            Classify what type of response the agent just received. This thread was started based on the activity ${projectChain.activityType}. 
            Choose one of activity type based on the message:
            ${this.getAvailableActions(ResponseType.RESPONSE).map(a => ` - ${a.activityType}: ${a.usage}`).join('\n')}
            - NONE: None of these types fit the request.

            Respond with the following JSON object:
            {
                "reasoning": "Selected X because of ...",
                "activityType": "X"
            }
        `;
        
        let history =[{ role: "system", content: prompt }]; // Initialize history with the prompt
        history = [...history, ...(projectChain.posts.map((chat) => (chat.user_id === this.userId ?
            { role: "assistant", content: chat.message } :
            { role: "user", content: chat.message })))
        ];

        const rawResponse = await this.lmStudioService.sendMessageToLLM(post.message, history, undefined, 8192, 128, jsonSchema);
        const response = JSON5.parse(rawResponse);
        Logger.info(`Model chose ${response.activityType} because ${response.reasoning}`);
        return response.activityType;
    }

    private getMethodForActivity(activityType: string): ((channelId: string, post: ChatPost) => Promise<void>) | null {
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

    private getMethodForResponse(activityType: string): ((channelId: string, post: ChatPost, projectChain: ProjectChainResponse) => Promise<void>) | null {
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

    private getAvailableActions(desiredResponseType: ResponseType): ActionMetadata[] {
        const actions : ActionMetadata[] = []
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
}