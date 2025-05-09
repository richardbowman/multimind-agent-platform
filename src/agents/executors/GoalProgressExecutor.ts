import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { ModelHelpers } from "../../llm/modelHelpers";
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { getGeneratedSchema } from "../../helpers/schemaUtils";
import { SchemaType } from "../../schemas/SchemaTypes";
import { ExecutorType } from '../interfaces/ExecutorType';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResult } from '../interfaces/StepResult';
import { TaskManager } from 'src/tools/taskManager';
import { ChatClient } from 'src/chat/chatClient';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { GoalProgressResponse } from 'src/schemas/goalProgress';
import Logger from 'src/helpers/logger';
import { StringUtils } from 'src/utils/StringUtils';
import { isUUID } from 'src/types/uuid';
import { withRetry } from 'src/helpers/retry';

/**
 * Executor that analyzes thread progress against channel goals.
 * Key capabilities:
 * - Compares thread content against defined goals
 * - Determines goal completion progress
 * - Updates goal status (in-progress/complete)
 * - Identifies goals that need attention
 * - Provides structured feedback on goal progress
 */
@StepExecutorDecorator(ExecutorType.GOAL_PROGRESS, 'Analyze thread progress against channel goals.')
export class GoalProgressExecutor extends BaseStepExecutor<StepResponse> {
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
        const { goal, context } = params;
        const schema = await getGeneratedSchema(SchemaType.GoalProgressResponse);

        // Create prompt using PromptBuilder
        const promptBuilder = this.startModel(params);
        
        // Add core instructions
        promptBuilder.addInstruction(this.modelHelpers.getFinalInstructions());
        promptBuilder.addInstruction(`You are a tool with the goal to:
1. Analyze the thread content against the channel goals
2. Determine which goals are in-progress or complete based on the discussion
3. Provide a message expressing the new state of the goals`);

        // Add content sections
        promptBuilder.addContext({contentType: ContentType.EXECUTE_PARAMS, params});

        if (context?.artifacts) {
            promptBuilder.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: context.artifacts});
        }

        if (params.channelGoals) {
            promptBuilder.addContext({contentType: ContentType.CHANNEL_GOALS, tasks: params.channelGoals});
        }

        promptBuilder.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});

        const { rawResult, goalAnalysis, status } = await withRetry<{ rawResult, goalAnalysis, status }>(async () => {
            // Build and execute prompt
            const rawResult = await promptBuilder.generate({
                message: goal
            });

            const { goalAnalysis } = StringUtils.extractAndParseJsonBlock<GoalProgressResponse>(rawResult.message, schema);
            const status = StringUtils.extractNonCodeContent(rawResult.message);
            return {
                rawResult,
                goalAnalysis,
                status
            };
        }, () => true);

        // Update task statuses based on the analysis
        if (goalAnalysis?.length) {
            await Promise.all(goalAnalysis.map(async analysis => {
                try {
                    const goalId = params.channelGoals[parseInt(analysis.goalIndex)-1].id;
                    const task = isUUID(goalId) && await this.taskManager.getTaskById(goalId);
                    if (task && task.status !== analysis.status) {
                        if (analysis.status === 'completed') {
                            await this.taskManager.completeTask(goalId);
                        } else if (analysis.status === 'inProgress') {
                            await this.taskManager.markTaskInProgress(goalId);
                        }
                    }
                } catch (error) {
                    Logger.error(`Failed to mark task ${analysis.goalIndex} as in-progress: ${error}`);
                }
            }));
        }

        return {
            finished: true,
            needsUserInput: false,
            replan: ReplanType.Allow,
            response: {
                status,
                data: {
                    goalAnalysis
                }
            }
        };
    }
}
