import { StepExecutor, StepResult } from '../stepBasedAgent';
import LMStudioService, { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { ModelHelpers } from 'src/llm/helpers';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';

@StepExecutorDecorator('validation', 'Verify the solution is complete and addresses all aspects of the problem')
export class ValidationExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: LMStudioService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string, previousResults: any[]): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                isComplete: {
                    type: "boolean",
                    description: "Whether the solution fully addresses the original goal"
                },
                missingAspects: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of aspects that still need to be addressed"
                },
                message: {
                    type: "string",
                    description: "Explanation of the validation results"
                }
            },
            required: ["isComplete", "message"]
        };

        const systemPrompt = `You are validating whether a proposed solution fully addresses the original goal.
Carefully analyze the previous steps and their results to determine if all aspects have been properly addressed.

Original Goal: ${goal}

Previous Results:
${previousResults.map((r, i) => `Step ${i + 1}: ${r.message}`).join('\n\n')}

Evaluate whether:
1. The solution completely addresses the original goal
2. All important aspects have been considered
3. The reasoning is sound and well-supported

If the solution is incomplete, list the specific aspects that still need to be addressed.`;

        const response = await this.modelHelpers.generate({
            message: "Validate solution completeness",
            instructions: new StructuredOutputPrompt(schema, systemPrompt)
        });

        const result = {
            type: 'validation',
            finished: true,
            isComplete: response.isComplete,
            missingAspects: response.missingAspects || [],
            response: {
                message: response.message
            }
        };

        // Ensure we always return a valid result with required fields
        return result;
    }
}
