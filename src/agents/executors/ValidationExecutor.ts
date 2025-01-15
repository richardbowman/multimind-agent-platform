import { ExecutorConstructorParams } from '../ExecutorConstructorParams';
import { StepExecutor } from '../StepExecutor';
import { StepResult } from '../StepResult';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ValidationResult } from '../../schemas/validation';
import { SchemaInliner } from '../../helpers/schemaInliner';
import * as schemaJson from "../../schemas/schema.json";
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from './ExecutorType';
import { ExecuteParams } from '../ExecuteParams';
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
        this.modelHelpers = new ModelHelpers(params.llmService, 'executor');
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const schema = generatedSchemaDef.ValidationResult;

        const systemPrompt = `You are validating whether a proposed solution addresses the original goal. 
Analyze the previous steps and their results to determine if a reasonable effort has been made.

Original Goal: ${params.goal}

Previous Results:
${params.previousResult?.map((r, i) => `Step ${i + 1}: ${r.message}`).join('\n\n') || 'No previous results'}

Evaluate whether the solution addresses the original goal, and the reasoning is sound and well-supported.

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

        const result: StepResult = {
            type: 'validation',
            finished: true,
            // Only request user input in conversation mode
            needsUserInput: params.executionMode === 'conversation' && !response.isComplete,
            allowReplan: params.executionMode === 'task' && !response.isComplete,
            missingAspects: response.missingAspects || [],
            response: {
                message: response.message
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
