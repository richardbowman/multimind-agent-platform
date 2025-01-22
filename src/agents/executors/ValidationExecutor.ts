import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResult } from '../interfaces/StepResult';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ValidationResult } from '../../schemas/validation';
import { SchemaInliner } from '../../helpers/schemaInliner';
import * as schemaJson from "../../schemas/schema.json";
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ExecuteParams } from '../interfaces/ExecuteParams';
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

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const schema = generatedSchemaDef.ValidationResult;

        // Get validation attempt count from latest result
        const latestResult = params.previousResult?.[params.previousResult.length - 1];
        const validationAttempts = (latestResult?.metadata?.validationAttempts || 0) + 1;
        const maxAttempts = 3; // Maximum validation attempts before forcing completion

        const systemPrompt = `You are validating whether a proposed solution addresses the original goal. 
Analyze the previous steps and their results to determine if a reasonable effort has been made.

Original Goal: ${params.goal}

Previous Results:
${params.previousResult?.map((r, i) => `Step ${i + 1}: ${r.message}`).join('\n\n') || 'No previous results'}

Evaluation Guidelines:
1. Consider if the solution makes reasonable progress toward the goal
2. Allow for iterative improvement rather than demanding perfection
3. Focus on critical issues rather than minor imperfections
4. If this is attempt ${validationAttempts} of ${maxAttempts}, be more lenient in validation

If the solution is wrong, list the specific aspects that must be addressed.`;

        // Adjust validation strictness based on execution mode
        const validationPrompt = params.executionMode === 'task' 
            ? `${systemPrompt}\n\nNote: This is running in task mode - be more lenient with validation since we can't request user input.`
            : systemPrompt;

        const response = await this.modelHelpers.generate<ValidationResult>({
            message: "Validate solution completeness",
            instructions: new StructuredOutputPrompt(schema, validationPrompt),
            context: params.context
        });

        // Force completion if we've reached max validation attempts
        const forceCompletion = validationAttempts >= maxAttempts;
        
        const result: StepResult = {
            type: 'validation',
            finished: true,
            needsUserInput: params.executionMode === 'conversation' && !response.isComplete && !forceCompletion,
            allowReplan: params.executionMode === 'task' && !response.isComplete && !forceCompletion,
            response: {
                message: forceCompletion 
                    ? `Maximum validation attempts reached (${maxAttempts}). Marking as complete despite remaining issues:\n` +
                      `${response.missingAspects?.map(a => `- ${a}`).join('\n')}`
                    : response.message,
                metadata: {
                    validationAttempts,
                    missingAspects: response.missingAspects || []
                }
            }
        };

        // If in task mode and validation failed, provide guidance for next steps
        if (params.executionMode === 'task' && !response.isComplete) {
            result.response.message = `Validation completed in task mode. Some aspects need attention:\n` +
                `${response.missingAspects?.map(a => `- ${a}`).join('\n')}\n` +
                `Continuing with next steps...`;
            result.needsUserInput = false;
        }

        return result;
    }
}
