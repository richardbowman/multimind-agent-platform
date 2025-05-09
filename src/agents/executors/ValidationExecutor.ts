import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from '../interfaces/StepResult';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ValidationResult } from '../../schemas/validation';
import { SchemaInliner } from '../../helpers/schemaInliner';
import * as schemaJson from "../../schemas/schema.json";
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { StringUtils } from 'src/utils/StringUtils';
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
export class ValidationExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;

    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const schema = generatedSchemaDef.ValidationResult;

        // Get validation attempt count from most recent validation result
        const validationResults = params.previousResponses?.filter(r => 
            r.data?.validationAttempts !== undefined
        ) || [];
        
        const latestValidationAttempt = validationResults[validationResults.length - 1];
        const validationAttempts = (latestValidationAttempt?.data?.validationAttempts || 0) + 1;
        const maxAttempts = 3; // Maximum validation attempts before forcing completion

        // Create a new prompt builder
        const promptBuilder = this.startModel(params);

        // Add core validation instructions
        promptBuilder.addInstruction(`You are validating whether a proposed solution addresses the original goal. 
Analyze the previous steps and their results to determine if a reasonable effort has been made.`);

        // Add execute params including goal
        promptBuilder.addContext({contentType: ContentType.EXECUTE_PARAMS, params});

        // Add previous results if available
        promptBuilder.addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses||[]});

        // Add previous results if available
        promptBuilder.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts||[]});

        // Add evaluation guidelines
        promptBuilder.addInstruction(`Evaluation Guidelines:
1. Consider if the solution makes reasonable progress toward the goal
2. Allow for iterative improvement rather than demanding perfection
3. Focus on critical issues rather than minor imperfections
4. If this is attempt ${validationAttempts} of ${maxAttempts}, be more lenient in validation

If the solution is wrong, list the specific aspects that must be addressed.`);

        promptBuilder.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});

        // Add execution mode context
        if (params.executionMode === 'task') {
            promptBuilder.addContext('Note: This is running in task mode - be more lenient with validation since we can\'t request user input.');
        }

        // Generate the validation response
        const rawResponse = await promptBuilder.generate({
            message: "Validate solution meets user goal."
        });

        const message = StringUtils.extractNonCodeContent(rawResponse.message);
        const response = StringUtils.extractAndParseJsonBlock<ValidationResult>(rawResponse.message);

        // Force completion if we've reached max validation attempts
        const forceCompletion = validationAttempts >= maxAttempts;
        
        const result: StepResult<StepResponse> = {
            type: StepResultType.Validation,
            finished: true,
            needsUserInput: params.executionMode === 'conversation' && forceCompletion,
            replan: response.isComplete ? ReplanType.Allow : ReplanType.Force,
            response: {
                type: StepResponseType.Validation,
                status: forceCompletion 
                    ? `Maximum validation attempts reached (${maxAttempts}). Marking as complete despite remaining issues:\n` +
                      `${response.missingAspects?.map(a => `- ${a}`).join('\n')}`
                    : response.message,
                data: {
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
