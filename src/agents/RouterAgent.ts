import { Agent, HandlerParams, HandleActivity, ResponseType, AgentConstructorParams } from './agents';
import { ExecutorType } from './executors/ExecutorType';
import { Project, Task } from '../tools/taskManager';
import { ModelMessageResponse } from '../schemas/ModelResponse';
import { StructuredOutputPrompt } from '../llm/ILLMService';
import Logger from '../helpers/logger';

interface RegisteredAgent {
    handle: string;
    description: string;
}

export class RouterAgent extends Agent<Project<Task>, Task> {
    private availableAgents: Map<string, RegisteredAgent>;

    constructor(params: AgentConstructorParams) {
        super(params);
        this.availableAgents = new Map();
    }

    public registerAgent(agentId: string, handle: string, description: string) {
        this.availableAgents.set(agentId, { handle, description });
        Logger.info(`Registered agent ${agentId} with handle ${handle}`);
    }

    @HandleActivity(ExecutorType.ROUTE_REQUEST, 'Route user request to appropriate agent', ResponseType.CHANNEL)
    protected async routeRequest(params: HandlerParams): Promise<void> {
        const { userPost } = params;

        const agentOptions = Array.from(this.availableAgents.entries())
            .map(([id, { description }]) => `- ${id}: ${description}`)
            .join('\n');

        const schema = {
            type: "object",
            properties: {
                selectedAgent: { 
                    type: "string",
                    enum: Array.from(this.availableAgents.keys())
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

        const prompt = `Analyze the user's request and select the most appropriate agent to handle it.
        Available agents:
        ${agentOptions}

        User request: "${userPost.message}"

        Respond with:
        - Which agent would be best suited to handle this request
        - Your reasoning for selecting this agent
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

    // Required abstract method implementations
    protected async processTask(task: Task): Promise<void> {
        // Router agent doesn't process tasks
    }

    protected async handlerThread(params: HandlerParams): Promise<void> {
        // Router agent doesn't handle threads
    }

    protected async handleChannel(params: HandlerParams): Promise<void> {
        await this.routeRequest(params);
    }

    protected projectCompleted(project: Project): void {
        // Router agent doesn't handle projects
    }
}
