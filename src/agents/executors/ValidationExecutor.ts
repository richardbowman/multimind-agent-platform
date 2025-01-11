import { StepExecutor, StepResult } from '../stepBasedAgent';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ValidationResult } from '../../schemas/validation';
import { SchemaInliner } from '../../helpers/schemaInliner';
import * as schemaJson from "../../schemas/schema.json";
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from './ExecutorType';
const generatedSchemaDef = new SchemaInliner(schemaJson).inlineReferences(schemaJson.definitions);

/**
 * Executor that validates solution completeness and correctness.
 * Key capabilities:
 * - Verifies solutions against original goals
 * - Evaluates reasoning soundness and logic
 * - Identifies missing or incomplete aspects
 * - Provides structured validation feedback
 * - Ensures comprehensive goal coverage
 * - Maintains solution quality standards
 * - Tracks validation status
 * - Generates improvement suggestions
 * - Validates cross-step consistency
 * - Creates detailed validation reports
 */
@StepExecutorDecorator(ExecutorType.VALIDATION, 'Before providing your final response, verify your work addresses the goal')
export class ValidationExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: ILLMService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async executeOld(goal: string, step: string, projectId: string, previousResults: any[]): Promise<StepResult> {
        const schema = generatedSchemaDef.ValidationResult;

        const systemPrompt = `You are validating whether a proposed solution addresses the original goal. 
Analyze the previous steps and their results to determine if a reasonable effort has been made.

Original Goal: ${goal}

Previous Results:
${previousResults.map((r, i) => `Step ${i + 1}: ${r.message}`).join('\n\n')}

Evaluate whether the solution addresses the original goal, and the reasoning is sound and well-supported.

If the solution is wrong, list the specific aspects that must be addressed.`;

        const response = await this.modelHelpers.generate<ValidationResult>({
            message: "Validate solution completeness",
            instructions: new StructuredOutputPrompt(schema, systemPrompt)
        });

        const result : StepResult = {
            type: 'validation',
            finished: true,
            isComplete: response.isComplete,
            needsUserInput: true,
            missingAspects: response.missingAspects || [],
            response: {
                message: response.message
            }
        };

        // Ensure we always return a valid result with required fields
        return result;
    }
}
