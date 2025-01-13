import { Agent, HandlerParams } from './agents';
import { Project, Task } from '../tools/taskManager';
import { ModelMessageResponse } from '../schemas/ModelResponse';
import { StructuredOutputPrompt } from '../llm/ILLMService';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { Settings } from "src/tools/settingsManager";


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

    protected async handlerThread(params: HandlerParams): Promise<void> {
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

        const schema = {
            type: "object",
            properties: {
                selectedAgent: {
                    type: "string",
                    enum: agentOptions.map(a => a?.handle) || []
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

        // Get the full conversation context
        const conversationContext = threadPosts
            .map(p => `${p.user_id === this.userId ? 'Assistant' : 'User'}: ${p.message}`)
            .join('\n');

        const prompt = `Analyze the ongoing conversation and determine the best way to respond. You must explicitly choose one of these next steps:

1. propose-transfer: When you have a good candidate agent but want user confirmation
   - Set readyToRoute: true
   - Select the most appropriate agent
   - Explain why they're the best choice
   - Include relevant project/task context
   - Ask for user confirmation before transferring

2. execute-transfer: When you're highly confident and should immediately transfer
   - Set readyToRoute: true
   - Select the most appropriate agent
   - Explain why they're the best choice
   - Include all necessary context for the transfer
   - Only use when confidence > 0.9

3. ask-clarification: When you need more information
   - Set readyToRoute: false
   - Politely ask specific clarifying questions
   - Explain what information is missing
   - Suggest possible directions for the conversation

4. provide-information: When you can answer directly
   - Set readyToRoute: false
   - Provide the requested information
   - Explain any relevant context
   - Suggest next steps if appropriate

Available agents:
${agentPromptOptions}

${project ? `Channel Project Details:
- Name: ${project.name}
- Goal: ${project.metadata?.description || 'No specific goal'}
- Status: ${project.metadata?.status || 'active'}
` : ''}

Conversation context:
${conversationContext}

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

        // Handle different next steps based on LLM's decision
        switch (response.nextStep) {
            case 'propose-transfer':
                if (response.selectedAgent && response.confidence > 0.7) {
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
                }
                break;

            case 'ask-clarification':
                await this.reply(userPost, {
                    message: response.response
                });
                break;

            case 'provide-information':
            default:
                await this.reply(userPost, {
                    message: response.response
                });
                break;
        }
            // Check if we've already suggested this agent in this thread
            const hasSuggested = threadPosts.some(post =>
                post.user_id === this.userId && post.props["routing-suggested"]
            );

            if (!hasSuggested) {
                await this.reply(userPost, {
                    message: response.response,
                }, {
                    "routing-suggested": true
                }
                );
            } else {
                // Get the agent handle directly from the confirmation response
                await this.chatClient.postInChannel(
                    userPost.channel_id,
                    `${response.selectedAgent} ${response.response}`,
                    {
                        "routed-from": userPost.user_id,
                        "routed-by": this.userId
                    }
                );
            }
        } else {
            // Always send the response message if we're not routing
            await this.reply(userPost, {
                message: response.response
            });
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
                return agent
            });

        const agentPromptOptions = agentOptions
            .map(agent => `- ${agent?.handle}: ${agent?.description}`)
            .filter(Boolean)
            .join('\n');

        const schema = {
            type: "object",
            properties: {
                selectedAgent: {
                    type: "string",
                    enum: agentOptions.map(a => a?.handle) || []
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
                }
            },
            required: ["response", "reasoning", "confidence"]
        };

        // Get project details if exists
        const project = channelData?.projectId ? this.projects.getProject(channelData.projectId) : null;
        const projectTasks = project ? Object.values(project.tasks) : [];

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
${agentPromptOptions}

${project ? `Channel Project Details:
- Name: ${project.name}
- Goal: ${project.metadata?.description || 'No specific goal'}
- Status: ${project.metadata?.status || 'active'}
- Tasks: ${projectTasks.length > 0 ?
                    projectTasks.map(t => `\n  * ${t.description} (${t.complete ? '✅ complete' : t.inProgress ? '⏳ in progress' : '🆕 not started'})`).join('')
                    : 'No tasks'}
` : ''}

User request: "${userPost.message}"

Respond with:
- selectedAgent: The best agent to handle this (optional if unclear)
- reasoning: Your detailed reasoning including any questions for clarification
- confidence: Your confidence level (0-1) in this selection
- response: The message to send to the user, which may include questions, explanations, or suggestions`;

        const response = await this.llmService.generateStructured(
            userPost,
            new StructuredOutputPrompt(schema, prompt),
            [],
            1024,
            512
        );

        // Always send the response message
        await this.reply(userPost, {
            message: response.response
        });

        // If we have a selected agent and high confidence, suggest them
        if (response.selectedAgent && response.confidence > 0.7) {
            await this.reply(userPost, {
                message: `I think ${response.selectedAgent} would be best suited to help you with this request. Would you like me to bring them in?`
            });
        }
    }

    protected projectCompleted(project: Project): void {
        // Router agent doesn't handle projects
    }
}
