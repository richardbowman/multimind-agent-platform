import { StepBasedAgent } from './stepBasedAgent';
import { ChatClient, ChatPost } from '../chat/chatClient';
import LMStudioService from '../llm/lmstudioService';
import { TaskManager } from '../tools/taskManager';
import { ThinkingExecutor } from './executors/ThinkingExecutor';
import { RefutingExecutor } from './executors/RefutingExecutor';
import { PlanStepsResponse } from './schemas/agent';
import { StructuredOutputPrompt } from '../llm/lmstudioService';

export class SolverAgent extends StepBasedAgent<any, any> {
    constructor(
        chatClient: ChatClient,
        lmStudioService: LMStudioService,
        userId: string,
        projects: TaskManager
    ) {
        super(chatClient, lmStudioService, userId, projects);
        
        // Register our specialized executors
        this.registerStepExecutor('thinking', new ThinkingExecutor(lmStudioService));
        this.registerStepExecutor('refuting', new RefutingExecutor(lmStudioService));
    }

    protected async planSteps(projectId: string, goal: string): Promise<PlanStepsResponse> {
        const schema = {
            type: "object",
            properties: {
                steps: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            type: {
                                type: "string",
                                enum: ["thinking", "refuting"],
                                description: "Type of reasoning step"
                            },
                            description: {
                                type: "string",
                                description: "Description of what this step will accomplish"
                            }
                        },
                        required: ["type", "description"]
                    }
                }
            },
            required: ["steps"]
        };

        const prompt = `You are planning how to solve a complex problem through careful reasoning.
Break down the solution into alternating steps of deep thinking and critical refutation.
Use 'thinking' steps for constructive reasoning and 'refuting' steps to challenge assumptions.`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        
        return await this.generate({
            message: goal,
            instructions
        });
    }
}
