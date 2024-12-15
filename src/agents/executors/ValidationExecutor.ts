import { StepExecutor, StepResult } from '../stepBasedAgent';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ValidationResult } from '../../schemas/validation';
import { SchemaInliner } from '../../helpers/schemaInliner';
import * as schemaJson from "../../schemas/schema.json";
import { StepExecutorDecorator } from '../decorators/executorDecorator';
const generatedSchemaDef = new SchemaInliner(schemaJson).inlineReferences(schemaJson.definitions);

@StepExecutorDecorator('validation', 'After doing other work steps, verify your work addresses the goal')
export class ValidationExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: ILLMService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string, previousResults: any[]): Promise<StepResult> {
        const schema = generatedSchemaDef.ValidationResult;

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

        const response = await this.modelHelpers.generate<ValidationResult>({
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
