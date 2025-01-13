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
            required: ["response", "reasoning", "confidence", "readyToRoute"]
        };

        // Get the full conversation context
        const conversationContext = threadPosts
            .map(p => `${p.user_id === this.userId ? 'Assistant' : 'User'}: ${p.message}`)
            .join('\n');

        const prompt = `Analyze the ongoing conversation and determine the best way to respond. Follow these guidelines:

1. If the request is clear and we have enough information:
   - Set readyToRoute: true
   - Select the most appropriate agent
   - Explain why they're the best choice
   - Include relevant project/task context

2. If more information is needed:
   - Set readyToRoute: false
   - Politely ask clarifying questions
   - Explain the channel's current project goals and tasks
   - Suggest possible directions for the conversation

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
- response: The message to send to the user
- readyToRoute: True if we have enough information to route to another agent`;

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

        // If we're ready to route and have high confidence, suggest the agent
        if (response.readyToRoute && response.selectedAgent && response.confidence > 0.7) {
            await this.reply(userPost, {
                message: `Based on our conversation, I think ${response.selectedAgent} would be best suited to help you with this request. Would you like me to bring them in?`
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
