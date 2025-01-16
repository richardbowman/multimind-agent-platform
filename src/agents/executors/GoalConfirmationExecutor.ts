import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StructuredOutputPrompt } from "../../llm/ILLMService";
import { ModelHelpers } from "../../llm/modelHelpers";
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { GoalConfirmationResponse } from "../../schemas/goalConfirmation";
import { getGeneratedSchema } from "../../helpers/schemaUtils";
import { SchemaType } from "../../schemas/SchemaTypes";
import { ExecutorType } from '../interfaces/ExecutorType';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';

/**
 * Executor that validates and confirms user goals before proceeding.
 * Key capabilities:
 * - Restates goals to demonstrate understanding
 * - Validates goal clarity and completeness
 * - Identifies missing or ambiguous information
 * - Provides structured feedback on goal viability
 * - Requests clarification when needed
 * - Ensures alignment between user intent and system understanding
 * - Tracks goal confirmation status
 * - Manages goal revision workflow
 */
@StepExecutorDecorator(ExecutorType.GOAL_CONFIRMATION, 'Confirm the goals of the user.')
export class GoalConfirmationExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
    }

    async execute(params: ExecuteParams & { executionMode: 'conversation' | 'task' }): Promise<StepResult> {
        const { goal, step, projectId } = params;
        const schema = await getGeneratedSchema(SchemaType.GoalConfirmationResponse);

        let prompt = `As an AI assistant, your task is to:
1. Restate the user's goal in your own words to demonstrate understanding
2. Confirm whether you have enough information to proceed
3. If anything is unclear, specify what additional information you need

Goal to analyze: "${goal}"`;

        // Add artifact context if available
        if (params.context?.artifacts) {
            prompt += '\n\n' + this.modelHelpers.formatArtifacts(params.context.artifacts);
        }

        const result = await this.modelHelpers.generate<GoalConfirmationResponse>({
            message: goal,
            instructions: new StructuredOutputPrompt(schema, prompt),
            threadPosts: params.context?.threadPosts || []
        });

        return {
            finished: result.understanding,
            needsUserInput: !result.understanding,
            response: {
                message: result.message
            }
        };
    }
}
