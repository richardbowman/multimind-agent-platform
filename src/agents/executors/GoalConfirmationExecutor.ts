import { ExecutorConstructorParams } from '../ExecutorConstructorParams';
import { StepExecutor } from '../StepExecutor';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from "../../llm/modelHelpers";
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { GoalConfirmationResponse } from "../../schemas/goalConfirmation";
import { getGeneratedSchema } from "../../helpers/schemaUtils";
import { SchemaType } from "../../schemas/SchemaTypes";
import { ILLMService } from "../../llm/ILLMService";
import { ExecutorType } from './ExecutorType';

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
        this.modelHelpers = new ModelHelpers(params.llmService, params.userId || 'executor');
    }

    async executeOld(goal: string, step: string, projectId: string): Promise<any> {
        const schema = await getGeneratedSchema(SchemaType.GoalConfirmationResponse);

        const prompt = `As an AI assistant, your task is to:
1. Restate the user's goal in your own words to demonstrate understanding
2. Confirm whether you have enough information to proceed
3. If anything is unclear, specify what additional information you need

Goal to analyze: "${goal}"`;

        const result = await this.modelHelpers.generate<GoalConfirmationResponse>({
            message: goal,
            instructions: new StructuredOutputPrompt(schema, prompt)
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
