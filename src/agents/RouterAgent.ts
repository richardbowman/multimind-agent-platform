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
        
        // Check if this is a confirmation response to a routing suggestion
        if (threadPosts.length > 0) {
            const lastAssistantPost = threadPosts
                .slice()
                .reverse()
                .find(p => p.user_id === this.userId);
            
            // Analyze the user's response to see if they confirmed
            const confirmationSchema = {
                type: "object",
                properties: {
                    confirmed: { type: "boolean" },
                    selectedAgent: { type: "string" },
                    messageToAgent: { type: "string" }
                },
                required: ["confirmed", "selectedAgent"]
            };

            const confirmationPrompt = `Analyze the user's response to determine if they confirmed the agent suggestion.
            Assistant Suggestion: ${lastAssistantPost?.message}
            User Response: ${userPost.message}

            Respond with:
            - confirmed: true if the user agreed to the suggestion, false otherwise
            - selectedAgent: The userId of the agent that was suggested
            - messageToAgent: A well-formed message to send to the suggested agent including the original request and any additional context from the user's response`;

            const confirmationResponse = await this.llmService.generateStructured(
                userPost,
                new StructuredOutputPrompt(confirmationSchema, confirmationPrompt),
                [],
                1024,
                512
            );

            if (confirmationResponse.confirmed) {
                // Get the agent handle directly from the confirmation response
                await this.chatClient.postInChannel(
                    userPost.channel_id,
                    `${confirmationResponse.selectedAgent} ${confirmationResponse.messageToAgent}`,
                    {
                        "routed-from": userPost.user_id,
                        "routed-by": this.userId
                    }
                );
                return;
            }
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
                suggestedQuestion: {
                    type: "string",
                    description: "A helpful follow-up question to ask the user if clarification is needed"
                }
            },
            required: ["selectedAgent", "reasoning", "confidence", "suggestedQuestion"]
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
- selectedAgent: The best agent to handle this (or null if unclear)
- reasoning: Your detailed reasoning including any questions for clarification
- confidence: Your confidence level (0-1) in this selection
- suggestedQuestion: A helpful follow-up question to ask the user (if needed)`;

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
