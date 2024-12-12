import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import LMStudioService, { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { Project, Task } from '../../tools/taskManager';
import { ModelResponse } from '../schemas/ModelResponse';

@StepExecutorDecorator('final_response', 'Generates final comprehensive response')
export class FinalResponseExecutor implements StepExecutor {
    constructor(private modelHelpers: LMStudioService) {
    }

    async execute(goal: string, step: string, projectId: string, previousResults?: any[]): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                message: {
                    type: "string",
                    description: "Final comprehensive response in Markdown format."
                }
            },
            required: ["message"]
        };

        const systemPrompt = `You are an AI assistant generating a final response.
Synthesize all the intermediate results into a clear, comprehensive answer that addresses the original goal.
Include relevant details from all steps while maintaining clarity and coherence.
You will respond inside of the message key in Markdown format.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const context = JSON.stringify({
            originalGoal: goal,
            previousResults
        }, null, 2);

        const response = await this.modelHelpers.generate({
            message: context,
            instructions,
            maxTokens: 16384
        });

        return {
            type: 'final_response',
            finished: true,
            response
        };
    }
}
