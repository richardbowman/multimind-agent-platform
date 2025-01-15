import { Agent, HandlerParams } from './agents';
import { Project, Task } from '../tools/taskManager';
import { ModelMessageResponse } from '../schemas/ModelResponse';
import { StructuredOutputPrompt } from '../llm/ILLMService';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { ChatPost } from 'src/chat/chatClient';


export class RouterAgent extends Agent {
    private confirmationTimeouts: Map<string, NodeJS.Timeout> = new Map();

    constructor(params: AgentConstructorParams) {
        super(params);
    }

    async initialize(): Promise<void> {
    }

    // Required abstract method implementations
    protected async processTask(task: Task): Promise<void> {
        // Router agent doesn't process tasks
    }

    private async getRoutingContext(params: HandlerParams) {
        const { userPost, threadPosts = [] } = params;
        
        // Get channel data including any project goals
        const channelData = await this.chatClient.getChannelData(userPost.channel_id);
        const project = channelData?.projectId
            ? this.projects.getProject(channelData.projectId)
            : null;

        // Get agent descriptions from settings for channel members
        const agentOptions = (channelData.members || [])
            .filter(memberId => this.userId !== memberId)
            .map(memberId => {
                const agent = Object.values(this.settings.agents).find(a => a.userId === memberId);
                return agent
            });

        const agentPromptOptions = agentOptions
            .map(agent => `- ${agent?.handle}: ${agent?.description}`)
            .filter(Boolean)
            .join('\n');

        // Get project tasks if exists
        const projectTasks = project ? Object.values(project.tasks) : [];

        // Get conversation context from thread posts if available
        const conversationContext = threadPosts.length > 0
            ? threadPosts.map(p => `${p.user_id === this.userId ? 'Assistant' : 'User'}: ${p.message}`).join('\n')
            : userPost.message;

        return {
            channelData,
            project,
            agentOptions,
            agentPromptOptions,
            projectTasks,
            conversationContext
        };
    }

    private async handleRoutingResponse(
        userPost: ChatPost,
        response: ModelMessageResponse,
        threadPosts: ChatPost[] = []
    ) {
        // Handle different next steps based on LLM's decision
        if (!response.nextStep) {
            // Default to provide-information if no nextStep specified
            response.nextStep = 'provide-information';
        }

        switch (response.nextStep) {
            case 'propose-transfer':
                if (response.selectedAgent) {
                    await this.reply(userPost, {
                        message: `I think ${response.selectedAgent} would be best suited to help with this. Would you like me to transfer this to them?\n\n${response.response}`
                    }, {
                        "routing-suggested": true,
                        "proposed-agent": response.selectedAgent
                    });
                }
                break;

            case 'execute-transfer':
                if (response.selectedAgent && response.confidence > 0.9) {
                    await this.chatClient.postInChannel(
                        userPost.channel_id,
                        `${response.selectedAgent} ${response.response}`,
                        {
                            "routed-from": userPost.user_id,
                            "routed-by": this.userId,
                            "routed-agent": response.selectedAgent
                        }
                    );
                    break;
                }

            case 'ask-clarification':
            case 'provide-information':
            default:
                // Check if we've already suggested this agent in this thread
                const hasSuggested = threadPosts.some(post =>
                    post.user_id === this.userId && post.props["routing-suggested"]
                );

                if (!hasSuggested) {
                    await this.reply(userPost, {
                        message: response.response,
                    }, {
                        "routing-suggested": true
                    });
                } else {
                    await this.reply(userPost, {
                        message: response.response
                    });
                }
                break;
        }
    }

    protected async handlerThread(params: HandlerParams): Promise<void> {
        const { userPost, threadPosts = [] } = params;
        const context = await this.getRoutingContext(params);

        const schema = {
            type: "object",
            properties: {
                selectedAgent: {
                    type: "string",
                    enum: context.agentOptions.map(a => a?.handle) || []
                },
                reasoning: { type: "string" },
                confidence: {
                    type: "number",
                    minimum: 0,
                    maximum: 1
                },
                response: {
                    type: "string",
                    description: "The message to send to the user, which may include questions, explanations, or suggestions"
                },
                readyToRoute: {
                    type: "boolean",
                    description: "True if we have enough information to route to another agent"
                }
            },
            required: ["response", "reasoning", "confidence"],
            properties: {
                nextStep: {
                    type: "string",
                    enum: ["propose-transfer", "execute-transfer", "ask-clarification", "provide-information"],
                    description: "The next step to take in the conversation"
                }
            }
        };

        const prompt = `Analyze the ongoing conversation and determine the best way to respond. You must explicitly choose one of these next steps:

1. propose-transfer: When you have a good candidate agent but want user confirmation
   - Select the most appropriate agent
   - Explain why they're the best choice
   - Include relevant project/task context
   - Ask for user confirmation before transferring

2. execute-transfer: When you're highly confident and should immediately transfer
   - Select the most appropriate agent
   - Explain why they're the best choice
   - Include all necessary context for the transfer
   - Only use when confidence > 0.9

3. ask-clarification: When you need more information
   - Politely ask specific clarifying questions
   - Explain what information is missing
   - Suggest possible directions for the conversation

4. provide-information: When you can answer directly
   - Provide the requested information
   - Explain any relevant context
   - Suggest next steps if appropriate

Available agents:
${context.agentPromptOptions}

${context.project ? `Channel Project Details:
- Name: ${context.project.name}
- Goal: ${context.project.metadata?.description || 'No specific goal'}
- Status: ${context.project.metadata?.status || 'active'}
` : ''}

Conversation context:
${context.conversationContext}

Respond with:
- selectedAgent: The best agent to handle this (optional if unclear)
- reasoning: Your detailed reasoning including any questions for clarification
- confidence: Your confidence level (0-1) in this selection
- response: If not ready to route, the message to send to the user. If ready to route, this is the message to send to the other agent.
- readyToRoute: True if we have enough information to route to another agent`;

        const response = await this.llmService.generateStructured(
            userPost,
            new StructuredOutputPrompt(schema, prompt),
            [],
            1024,
            512
        );

        await this.handleRoutingResponse(userPost, response, threadPosts);
    }

    protected async handleChannel(params: HandlerParams): Promise<void> {
        const context = await this.getRoutingContext(params);

        const schema = {
            type: "object",
            properties: {
                selectedAgent: {
                    type: "string",
                    enum: context.agentOptions.map(a => a?.handle) || []
                },
                reasoning: { type: "string" },
                confidence: {
                    type: "number",
                    minimum: 0,
                    maximum: 1
                },
                response: {
                    type: "string",
                    description: "The message to send to the user, which may include questions, explanations, or suggestions"
                },
                readyToRoute: {
                    type: "boolean",
                    description: "True if we have enough information to route to another agent"
                }
            },
            required: ["response", "reasoning", "confidence", "readyToRoute"],
            additionalProperties: {
                nextStep: {
                    type: "string",
                    enum: ["propose-transfer", "execute-transfer", "ask-clarification", "provide-information"],
                    description: "The next step to take in the conversation"
                }
            }
        };

        const prompt = `Analyze the user's request and determine the best way to respond. Follow these guidelines:

1. If the request is clear and directly related to a specific agent's expertise:
   - Select the most appropriate agent
   - Explain why they're the best choice
   - Include relevant project/task context

2. If the request is unclear, vague, or just an introduction:
   - Politely ask clarifying questions
   - Explain the channel's current project goals and tasks
   - Suggest possible directions for the conversation

3. When explaining project context:
   - Summarize the project goal in simple terms
   - Highlight key tasks and their status
   - Mention any blockers or important deadlines

Available agents:
${context.agentPromptOptions}

${context.project ? `Channel Project Details:
- Name: ${context.project.name}
- Goal: ${context.project.metadata?.description || 'No specific goal'}
- Status: ${context.project.metadata?.status || 'active'}
- Tasks: ${context.projectTasks.length > 0 ?
                    context.projectTasks.map(t => `\n  * ${t.description} (${t.complete ? '✅ complete' : t.inProgress ? '⏳ in progress' : '🆕 not started'})`).join('')
                    : 'No tasks'}
` : ''}

User request: "${context.conversationContext}"

Respond with:
- selectedAgent: The best agent to handle this (optional if unclear)
- reasoning: Your detailed reasoning including any questions for clarification
- confidence: Your confidence level (0-1) in this selection
- response: The message to send to the user, which may include questions, explanations, or suggestions
- readyToRoute: True if we have enough information to route to another agent`;

        const response = await this.llmService.generateStructured(
            params.userPost,
            new StructuredOutputPrompt(schema, prompt),
            [],
            1024,
            512
        );

        await this.handleRoutingResponse(params.userPost, response);
    }

    protected projectCompleted(project: Project): void {
        // Router agent doesn't handle projects
    }
}
