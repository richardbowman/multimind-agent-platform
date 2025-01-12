import { Agent, HandlerParams } from './agents';
import { Project, Task } from '../tools/taskManager';
import { ModelMessageResponse } from '../schemas/ModelResponse';
import { StructuredOutputPrompt } from '../llm/ILLMService';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { Settings } from "src/tools/settingsManager";


export class RouterAgent extends Agent {
    private settings: Settings;
    private confirmationTimeouts: Map<string, NodeJS.Timeout> = new Map();

    constructor(params: AgentConstructorParams) {
        super(params);
        this.settings = params.settings;
    }

    private async waitForConfirmation(confirmationPostId: string, channelId: string): Promise<ChatPost | null> {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.confirmationTimeouts.delete(confirmationPostId);
                resolve(null);
            }, 30000); // 30 second timeout

            this.confirmationTimeouts.set(confirmationPostId, timeout);

            const messageHandler = async (post: ChatPost) => {
                if (post.channel_id === channelId && 
                    post.getRootId() === confirmationPostId &&
                    post.user_id !== this.userId) {
                    
                    // Clear the timeout
                    const timeout = this.confirmationTimeouts.get(confirmationPostId);
                    if (timeout) {
                        clearTimeout(timeout);
                        this.confirmationTimeouts.delete(confirmationPostId);
                    }

                    // Stop listening
                    this.chatClient.closeCallback();
                    
                    resolve(post);
                }
            };

            this.chatClient.receiveMessages(messageHandler);
        });
    }

    async initialize(): Promise<void> {
    }

    // Required abstract method implementations
    protected async processTask(task: Task): Promise<void> {
        // Router agent doesn't process tasks
    }

    protected async handlerThread(params: HandlerParams): Promise<void> {
        const { userPost, threadPosts = [] } = params;
        
        // Get channel data including any project goals
        const channelData = await this.chatClient.getChannelData(userPost.channel_id);
        
        // Get agent descriptions from settings for channel members
        const settings = this.settingsManager.getSettings();
        const agentOptions = (channelData.members || [])
            .filter(memberId => this.userId !== memberId)
            .map(memberId => {
                const agent = Object.values(settings.agents).find(a => a.userId === memberId);
                return agent ? `- ${agent.handle}: ${agent.description}` : null;
            })
            .filter(Boolean)
            .join('\n');

        const schema = {
            type: "object",
            properties: {
                selectedAgent: { 
                    type: "string",
                    enum: channelData.members || []
                },
                reasoning: { type: "string" },
                confidence: { 
                    type: "number",
                    minimum: 0,
                    maximum: 1
                }
            },
            required: ["selectedAgent", "reasoning", "confidence"]
        };

        // Get project details if exists
        const project = channelData?.projectId ? this.projects.getProject(channelData.projectId) : null;
        const projectTasks = project ? Object.values(project.tasks) : [];
        
        // Build prompt with conversation context
        const conversationContext = threadPosts
            .map((post, i) => `[${i+1}] ${post.user_id === this.userId ? 'Assistant' : 'User'}: ${post.message}`)
            .join('\n');
        
        const prompt = `Analyze the ongoing conversation and select the most appropriate agent to handle the user's latest message.
        Available agents:
        ${agentOptions}

        ${project ? `Channel Project Details:
        - Name: ${project.name}
        - Goal: ${project.metadata?.description || 'No specific goal'}
        - Status: ${project.metadata?.status || 'active'}
        - Tasks: ${projectTasks.length > 0 ? 
            projectTasks.map(t => `\n  * ${t.description} (${t.complete ? 'complete' : 'in progress'})`).join('') 
            : 'No tasks'}
        ` : ''}

        Conversation Context:
        ${conversationContext}

        Latest User Message: "${userPost.message}"

        Respond with:
        - Which agent would be best suited to handle this request
        - Your reasoning for selecting this agent (considering the conversation context and any channel project goals/tasks)
        - Your confidence level (0-1) in this selection`;

        const response = await this.llmService.generateStructured(
            userPost,
            new StructuredOutputPrompt(schema, prompt),
            [],
            1024,
            512
        );

        if (!response.selectedAgent) {
            await this.reply(userPost, {
                message: "I apologize, but I'm not sure which agent would be best suited to help you. Could you please provide more details about your request?"
            });
            return;
        }

        // If confidence is high enough (e.g., > 0.7), suggest the agent
        if (response.confidence > 0.7) {
            const confirmationMessage: ModelMessageResponse = {
                message: `I think ${response.selectedAgent} would be best suited to help you with this request. Would you like me to bring them in? (Reply with "yes" to confirm)\n\nReasoning: ${response.reasoning}`
            };
            const confirmationPost = await this.reply(userPost, confirmationMessage);
            
            // Wait for user's confirmation response
            const confirmationResponse = await this.waitForConfirmation(confirmationPost.id, userPost.channel_id);
            
            if (confirmationResponse?.message?.toLowerCase().trim() === 'yes') {
                // Get the agent's handle from settings
                const agent = Object.values(this.settings.agents).find(a => a.userId === response.selectedAgent);
                if (agent?.handle) {
                    // Send a channel message @mentioning the agent
                    const routingMessage = `@${agent.handle} ${userPost.message}\n\nThis request was routed to you because: ${response.reasoning}`;
                    await this.chatClient.postInChannel(
                        userPost.channel_id, 
                        routingMessage,
                        {
                            "routed-from": userPost.user_id,
                            "routed-by": this.userId
                        }
                    );
                }
            }
        } else {
            // If confidence is low, ask for clarification
            const clarificationMessage: ModelMessageResponse = {
                message: `I'm not entirely sure, but I think ${response.selectedAgent} might be able to help. Could you please provide more details about what you're looking to accomplish?`
            };
            await this.reply(userPost, clarificationMessage);
        }
    }

    protected async handleChannel(params: HandlerParams): Promise<void> {
        const { userPost } = params;

        // Get channel data including any project goals
        const channelData = await this.chatClient.getChannelData(userPost.channel_id);
        const projectGoal = channelData?.projectId 
            ? this.projects.getProject(channelData.projectId)?.metadata?.description
            : null;

        // Get agent descriptions from settings for channel members
        const agentOptions = (channelData.members || [])
            .filter(memberId => this.userId !== memberId)
            .map(memberId => {
                const agent = Object.values(this.settings.agents).find(a => a.userId === memberId);
                return agent ? `- ${agent.handle}: ${agent.description}` : null;
            })
            .filter(Boolean)
            .join('\n');

        const schema = {
            type: "object",
            properties: {
                selectedAgent: { 
                    type: "string",
                    enum: channelData.members || []
                },
                reasoning: { type: "string" },
                confidence: { 
                    type: "number",
                    minimum: 0,
                    maximum: 1
                }
            },
            required: ["selectedAgent", "reasoning", "confidence"]
        };

        // Get project details if exists
        const project = channelData?.projectId ? this.projects.getProject(channelData.projectId) : null;
        const projectTasks = project ? Object.values(project.tasks) : [];
        
        const prompt = `Analyze the user's request and select the most appropriate agent to handle it.
        Available agents:
        ${agentOptions}

        ${project ? `Channel Project Details:
        - Name: ${project.name}
        - Goal: ${project.metadata?.description || 'No specific goal'}
        - Status: ${project.metadata?.status || 'active'}
        - Tasks: ${projectTasks.length > 0 ? 
            projectTasks.map(t => `\n  * ${t.description} (${t.complete ? 'complete' : 'in progress'})`).join('') 
            : 'No tasks'}
        ` : ''}

        User request: "${userPost.message}"

        Respond with:
        - Which agent would be best suited to handle this request
        - Your reasoning for selecting this agent (considering any channel project goals and tasks)
        - Your confidence level (0-1) in this selection`;

        const response = await this.llmService.generateStructured(
            userPost,
            new StructuredOutputPrompt(schema, prompt),
            [],
            1024,
            512
        );

        if (!response.selectedAgent) {
            await this.reply(userPost, {
                message: "I apologize, but I'm not sure which agent would be best suited to help you. Could you please provide more details about your request?"
            });
            return;
        }

        // If confidence is high enough (e.g., > 0.7), suggest the agent
        if (response.confidence > 0.7) {
            const confirmationMessage: ModelMessageResponse = {
                message: `I think ${response.selectedAgent} would be best suited to help you with this request. Would you like me to bring them in?\n\nReasoning: ${response.reasoning}`
            };
            await this.reply(userPost, confirmationMessage);
        } else {
            // If confidence is low, ask for clarification
            const clarificationMessage: ModelMessageResponse = {
                message: `I'm not entirely sure, but I think ${response.selectedAgent} might be able to help. Could you please provide more details about what you're looking to accomplish?`
            };
            await this.reply(userPost, clarificationMessage);
        }
    }

    protected projectCompleted(project: Project): void {
        // Router agent doesn't handle projects
    }
}
