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
import { ReplanType, StepResult } from '../interfaces/StepResult';
import { TaskManager } from 'src/tools/taskManager';
import { ChatClient } from 'src/chat/chatClient';
import { ContentType } from 'src/llm/promptBuilder';

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

        // Create prompt using PromptBuilder
        const promptBuilder = this.modelHelpers.createPrompt();
        
        // Add core instructions
        promptBuilder.addInstruction(this.modelHelpers.getFinalInstructions());

        // Add content sections
        promptBuilder.addContent(ContentType.OVERALL_GOAL, params.overallGoal)

        promptBuilder.addContent(ContentType.EXECUTE_PARAMS, {
            goal,
            step,
            projectId
        });

        promptBuilder.addContent(ContentType.ARTIFACTS_EXCERPTS, params.context?.artifacts);
        promptBuilder.addContent(ContentType.CONVERSATION, params.context?.threadPosts);
        promptBuilder.addContent(ContentType.GOALS, params.channelGoals);

        promptBuilder.addContent(ContentType.EXECUTE_PARAMS, params)

        promptBuilder.addInstruction(`IMPORTANT RESPONSE INSTRUCTIONS:
            YOU MUST ELIMINATE acronyms or other terminology that may be ambigous or confusing to other agents.

            1. Determine if the goal, or any terminology used is ambiguous.
            2. If the goal or terminology is ambiguous, respond with the additional information you need and understanding=false
            3. If the goal and terminology is clear, respond with understanding=true. Restate the user's goal to be as clear and unambiguous as possible.`);
            
        // Build and execute prompt
        const result = await this.modelHelpers.generate<GoalConfirmationResponse>({
            message: goal,
            instructions: new StructuredOutputPrompt(schema, promptBuilder),
            threadPosts: params.context?.threadPosts || []
        });

        return {
            finished: params.executionMode === "task" ? true : result.understanding,
            needsUserInput: params.executionMode === "task" ? false : !result.understanding,
            replan: ReplanType.Allow,
            goal: result.message,
            response: {
                message: result.message
            }
        };
    }
}
