import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { ModelHelpers } from "../../llm/modelHelpers";
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { GoalConfirmationResponse } from "../../schemas/goalConfirmation";
import { getGeneratedSchema } from "../../helpers/schemaUtils";
import { SchemaType } from "../../schemas/SchemaTypes";
import { ExecutorType } from '../interfaces/ExecutorType';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResult } from '../interfaces/StepResult';
import { TaskManager } from 'src/tools/taskManager';
import { ChatClient } from 'src/chat/chatClient';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { StringUtils } from 'src/utils/StringUtils';

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
export class GoalConfirmationExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;
    private chatClient: ChatClient;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager;
        this.chatClient = params.chatClient;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const { goal, step, projectId } = params;
        const schema = await getGeneratedSchema(SchemaType.GoalConfirmationResponse);

        // Create prompt using PromptBuilder
        const promptBuilder = this.startModel(params);
        
        // Add core instructions
        promptBuilder.addInstruction(this.modelHelpers.getFinalInstructions());

        // Add content sections
        params.overallGoal && promptBuilder.addContext({ contentType: ContentType.OVERALL_GOAL, goal: params.overallGoal });
        params.context?.artifacts && promptBuilder.addContext({ contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts });
        promptBuilder.addContext({ contentType: ContentType.CHANNEL_GOALS, tasks: params.channelGoals });
        promptBuilder.addContext({ contentType: ContentType.EXECUTE_PARAMS, params: params });
        promptBuilder.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});

        promptBuilder.addInstruction(`You are a thinking step requested by the agent. YOU MUST ELIMINATE acronyms or other terminology that may be ambigous or confusing to other agents.

1. Determine if the goal, or any terminology used is ambiguous.
2. If the goal or terminology is ambiguous, respond with the additional information you need and understanding=false (only available in conversation mode). Your response should we worded to explain to the agent what information you think they should gather.
3. If the goal and terminology is clear, respond with understanding=true. Restate the user's goal to be as clear and unambiguous as possible. Do not pose a question because the agent will move forward.

Try not to be pedantic. Be sensible in helping refine the goal yourself.`);
            
        // Build and execute prompt
        const rawResult = await promptBuilder.generate({
            message: goal
        });

        const message = StringUtils.extractNonCodeContent(rawResult.message);
        const result = StringUtils.extractAndParseJsonBlock<GoalConfirmationResponse>(rawResult.message, schema);


        return {
            finished: true,
            replan: ReplanType.Allow,
            response: {
                status: message,
                data: {
                    understandable: result.understanding
                }
            }
        };
    }
}
