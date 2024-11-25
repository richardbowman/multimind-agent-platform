import { Action } from "@mattermost/types/product_notices";
import { ChatClient, ChatPost, ConversationContext } from "src/chat/chatClient";
import Logger from "src/helpers/logger";
import { SystemPromptBuilder } from "src/helpers/systemPrompt";
import ChromaDBService from "src/llm/chromaService";
import LMStudioService from "src/llm/lmstudioService";

export interface ActionMetadata {
    public activityType: string;
    public usage: string;
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

export class Agent {
    protected chatClient: ChatClient;
    protected lmStudioService: LMStudioService;
    protected userId: string;
    protected chromaDBService: ChromaDBService;
    protected promptBuilder: SystemPromptBuilder;

    constructor(chatClient: ChatClient, lmStudioService: LMStudioService, userId: string) {
        this.chatClient = chatClient;
        this.lmStudioService = lmStudioService;
        this.userId = userId;
        this.chromaDBService = new ChromaDBService();
        this.promptBuilder = new SystemPromptBuilder();
    }

    // Common method for sending messages
    protected async sendMessage(channelId: string, message: string, postProps?: ConversationContext): Promise<ChatPost> {
        return await this.chatClient.createPost(channelId, message, postProps);
    }

    // Common method for fetching previous messages
    protected async fetchMessages(channelId: string): Promise<ChatPost[]> {
        return await this.chatClient.fetchPreviousMessages(channelId);
    }

    public async setupChatMonitor(monitorChannelId: string) {
        // Initialize the WebSocket client for real-time message listening
        this.chatClient.initializeWebSocket(async (post: ChatPost) => {
            // Get the channel ID and user ID
            const channelId = post.channel_id;
            const userId = post.user_id;

            if (monitorChannelId === channelId && userId !== this.userId) {
                Logger.info(`Received message: ${post.message.slice(0,100)}... in ${channelId} from ${userId}, with root id ${post.getRootId()}`);

                let context: ConversationContext | undefined;

                if (!post.getRootId()) {
                    // Determine the type of activity using an LLM
                    const activityType = await this.classifyActivity(post.message, ResponseType.CHANNEL);
                    
                    // Retrieve the method based on the activity type
                    const handlerMethod = this.getMethodForActivity(activityType);
                    if (handlerMethod) {
                        await handlerMethod(channelId, post);
                    } else {
                        Logger.error(`Unsupported activity type: ${activityType}`);
                        await this.chatClient.createPost(channelId, `Sorry, I don't support ${activityType} yet.`, {});
                    }
                } else {
                    const postRootId : string = post.getRootId()||"";
                    
                    Logger.info(`Received thread message: ${post.message} in ${channelId} from ${userId}, with root id ${postRootId}`);

                    const projectChain = await this.chatClient.findProjectChain(post.channel_id, postRootId);
                    // const activityType = projectChain.activityType||'web-research';

                    // Determine the type of activity using an LLM
                    const activityType = await this.classifyActivity(post.message, ResponseType.RESPONSE);

                    // Retrieve the method based on the activity type
                    const handlerMethod = this.getMethodForResponse(activityType);
                    if (handlerMethod) {
                        await handlerMethod(channelId, post);
                    } else {
                        Logger.info(`Unsupported activity type: ${activityType}`);
                        await this.chatClient.createPost(channelId, `Sorry, I don't support ${activityType} yet.`, {});
                    }
                }
            } else {
                // Logger.info(`Ignoring message: ${post.message} in ${channelId} from ${userId}, with root id ${post.root_id}`);
            }
        });
    }

    private async classifyActivity(message: string, responseType: ResponseType): Promise<string> {
        const prompt = `
            You classify what type of message the agent just recevied.
            
            Please choose one of the following activity types for the given request:
            ${this.getAvailableActions(responseType).map(a => ` - ${a.activityType}: ${a.usage}`).join('\n')}
            
            Respond with only the activity type.
        `;
        Logger.info(prompt);
        
        const history = [{ role: "system", content: prompt }]; // Initialize history with the prompt
        const response = await this.lmStudioService.sendMessageToLLM(message, history);
        Logger.info(response);
        return response;
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

    private getMethodForResponse(activityType: string): ((channelId: string, post: ChatPost) => Promise<void>) | null {
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