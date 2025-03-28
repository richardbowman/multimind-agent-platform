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
import { TaskStatus } from 'src/schemas/TaskStatus';
import { ChatClient } from 'src/chat/chatClient';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { GoalProgressResponse } from 'src/schemas/goalProgress';
import Logger from 'src/helpers/logger';
import { StringUtils } from 'src/utils/StringUtils';
import { isUUID } from 'src/types/uuid';

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
        promptBuilder.addInstruction(`Your goal is to:
1. Analyze the thread content against the channel goals
2. Determine which goals are in-progress or complete based on the discussion
3. Provide structured feedback on goal progress
4. Update goal status where appropriate`);

        // Add content sections
        promptBuilder.addContext({contentType: ContentType.EXECUTE_PARAMS, params});

        if (context?.artifacts) {
            promptBuilder.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: context.artifacts});
        }

        if (params.channelGoals) {
            promptBuilder.addContext({contentType: ContentType.CHANNEL_GOALS, tasks: params.channelGoals});
        }

        promptBuilder.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});

        // Build and execute prompt
        const rawResult = await promptBuilder.generate({
            message: goal
        });

        const result = StringUtils.extractAndParseJsonBlock<GoalProgressResponse>(rawResult.message, schema);
        const message = StringUtils.extractNonCodeContent(rawResult.message);

        // Update task statuses based on the analysis
        if (result?.goalsInProgress?.length) {
            await Promise.all(result.goalsInProgress.map(async goalIndex => {
                try {
                    const goalId = params.channelGoals[parseInt(goalIndex)-1].id;

                    const task = isUUID(goalId) && await this.taskManager.getTaskById(goalId);
                    if (task && task.status !== TaskStatus.InProgress) {
                        await this.taskManager.markTaskInProgress(goalId);
                        // Update project status if needed
                        const project = await this.taskManager.getProject(task.projectId);
                        if (project && project.metadata.status !== 'active') {
                            await this.taskManager.updateProject(task.projectId, {
                                metadata: { ...project.metadata, status: 'active' }
                            });
                        }
                    }
                } catch (error) {
                    Logger.error(`Failed to mark task ${goalIndex} as in-progress: ${error}`);
                }
            }));
        }

        if (result?.goalsCompleted?.length) {
            await Promise.all(result.goalsCompleted.map(async goalIndex => {
                try {
                    const goalId = params.channelGoals[parseInt(goalIndex)-1].id;
                    const task = isUUID(goalId) && await this.taskManager.getTaskById(goalId);
                    if (task && task.status !== TaskStatus.Completed) {
                        await this.taskManager.completeTask(goalId);
                        // Check if all tasks in project are complete
                        const project = await this.taskManager.getProject(task.projectId);
                        if (project) {
                            const allTasksComplete = Object.values(project.tasks)
                                .every(t => t.status === TaskStatus.Completed);
                            if (allTasksComplete) {
                                await this.taskManager.updateProject(task.projectId, {
                                    metadata: { ...project.metadata, status: 'completed' }
                                });
                            }
                        }
                    }
                } catch (error) {
                    Logger.error(`Failed to mark task ${goalIndex} as complete: ${error}`);
                }
            }));
        }

        return {
            finished: true,
            needsUserInput: false,
            replan: ReplanType.Allow,
            goal: result?.summary,
            response: {
                message,
                data: {
                    goalsUpdated: result?.goalsUpdated,
                    goalsInProgress: result?.goalsInProgress,
                    goalsCompleted: result?.goalsCompleted
                }
            }
        };
    }
}
