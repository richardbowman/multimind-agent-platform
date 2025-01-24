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
import { TaskManager } from 'src/tools/taskManager';
import { ChatClient } from 'src/chat/chatClient';

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
    private taskManager: TaskManager;
    private chatClient: ChatClient;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager;
        this.chatClient = params.chatClient;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const { goal, step, projectId } = params;
        const schema = await getGeneratedSchema(SchemaType.GoalConfirmationResponse);

        // Get channel data including any project goals
        const channelData = await this.chatClient.getChannelData(userPost.channel_id);
        const project = channelData?.projectId
            ? this.taskManager.getProject(channelData.projectId)
            : null;

            
        let prompt = `
        Overall agent instructions:
        ${this.modelHelpers.getFinalInstructions()}
        
        Your goal is to:
1. Restate the user's goal in your own words
2. Decide if you have enough information to proceed, and if so, respond with understanding=true
3. If the goal is not actionable, respond with the additional information you need and understanding=false

Message to analyze: "${goal}"`;

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
            allowReplan: true,
            goal: result.message,
            response: {
                message: result.message
            }
        };
    }
}
