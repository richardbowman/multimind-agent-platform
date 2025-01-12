import { Agent, HandlerParams, HandleActivity, ResponseType } from './agents';
import { ExecutorType } from './executors/ExecutorType';
import { Project, Task } from '../tools/taskManager';
import { ModelMessageResponse } from '../schemas/ModelResponse';
import { StructuredOutputPrompt } from '../llm/ILLMService';
import Logger from '../helpers/logger';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';

interface RegisteredAgent {
    handle: string;
    description: string;
}

export class RouterAgent extends Agent<Project<Task>, Task> {
    private settingsManager: SettingsManager;

    constructor(params: AgentConstructorParams) {
        super(params);
        this.settingsManager = params.settingsManager;
    }

    async initialize(): Promise<void> {
    }

    // Required abstract method implementations
    protected async processTask(task: Task): Promise<void> {
        // Router agent doesn't process tasks
    }

    protected async handlerThread(params: HandlerParams): Promise<void> {
        // Router agent doesn't handle threads
    }

    protected async handleChannel(params: HandlerParams): Promise<void> {
        const { userPost } = params;

        // Get channel data including any project goals
        const channelData = await this.chatClient.getChannelData(userPost.channel_id);
        const projectGoal = channelData?.projectId 
            ? this.projects.getProject(channelData.projectId)?.metadata?.description
            : null;

        // Get agent descriptions from settings for channel members
        const settings = this.settingsManager.getSettings();
        const agentOptions = (channelData.members || [])
            .map(memberId => {
                const agent = settings.agents[memberId];
                return agent ? `- ${agent.handle || memberId}: ${agent.description}` : null;
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

        const selectedAgent = this.availableAgents.get(response.selectedAgent);
        
        if (!selectedAgent) {
            await this.reply(userPost, {
                message: "I apologize, but I'm not sure which agent would be best suited to help you. Could you please provide more details about your request?"
            });
            return;
        }

        // If confidence is high enough (e.g., > 0.7), suggest the agent
        if (response.confidence > 0.7) {
            const confirmationMessage: ModelMessageResponse = {
                message: `I think ${selectedAgent.handle} would be best suited to help you with this request. Would you like me to bring them in?\n\nReasoning: ${response.reasoning}`
            };
            await this.reply(userPost, confirmationMessage);
        } else {
            // If confidence is low, ask for clarification
            const clarificationMessage: ModelMessageResponse = {
                message: `I'm not entirely sure, but I think ${selectedAgent.handle} might be able to help. Could you please provide more details about what you're looking to accomplish?`
            };
            await this.reply(userPost, clarificationMessage);
        }
    }

    protected projectCompleted(project: Project): void {
        // Router agent doesn't handle projects
    }
}
