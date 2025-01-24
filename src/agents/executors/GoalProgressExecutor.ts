import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StructuredOutputPrompt } from "../../llm/ILLMService";
import { ModelHelpers } from "../../llm/modelHelpers";
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { getGeneratedSchema } from "../../helpers/schemaUtils";
import { SchemaType } from "../../schemas/SchemaTypes";
import { ExecutorType } from '../interfaces/ExecutorType';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';
import { TaskManager } from 'src/tools/taskManager';
import { ChatClient } from 'src/chat/chatClient';
import { ContentType } from 'src/llm/promptBuilder';
import { GoalProgressResponse } from "../../schemas/goalProgress";

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
export class GoalProgressExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;
    private chatClient: ChatClient;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager;
        this.chatClient = params.chatClient;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const { goal, projectId, context } = params;
        const schema = await getGeneratedSchema(SchemaType.GoalProgressResponse);

        // Create prompt using PromptBuilder
        const promptBuilder = this.modelHelpers.createPrompt();
        
        // Add core instructions
        promptBuilder.addInstruction(this.modelHelpers.getFinalInstructions());
        promptBuilder.addInstruction(`Your goal is to:
1. Analyze the thread content against the channel goals
2. Determine which goals are in-progress or complete based on the discussion
3. Provide structured feedback on goal progress
4. Update goal status where appropriate`);

        // Add content sections
        promptBuilder.addContent(ContentType.EXECUTE_PARAMS, {
            goal,
            projectId
        });

        if (context?.artifacts) {
            promptBuilder.addContent(ContentType.ARTIFACTS, context.artifacts);
        }

        if (context?.threadPosts) {
            promptBuilder.addContent(ContentType.CONVERSATION, context.threadPosts);
        }

        if (params.channelGoals) {
            promptBuilder.addContent(ContentType.GOALS, params.channelGoals);
        }

        // Build and execute prompt
        const prompt = promptBuilder.build();
        const result = await this.modelHelpers.generate<GoalProgressResponse>({
            message: goal,
            instructions: new StructuredOutputPrompt(schema, prompt),
            threadPosts: context?.threadPosts || []
        });

        // Update task statuses based on the analysis
        if (result.goalsInProgress?.length) {
            await Promise.all(result.goalsInProgress.map(async goalId => {
                try {
                    const task = this.taskManager.getTaskById(goalId);
                    if (task && task.status !== TaskStatus.InProgress) {
                        await this.taskManager.markTaskInProgress(goalId);
                        // Update project status if needed
                        const project = this.taskManager.getProject(task.projectId);
                        if (project && project.metadata.status !== 'active') {
                            await this.taskManager.updateProject(task.projectId, {
                                metadata: { ...project.metadata, status: 'active' }
                            });
                        }
                    }
                } catch (error) {
                    Logger.error(`Failed to mark task ${goalId} as in-progress: ${error}`);
                }
            }));
        }

        if (result.goalsCompleted?.length) {
            await Promise.all(result.goalsCompleted.map(async goalId => {
                try {
                    const task = this.taskManager.getTaskById(goalId);
                    if (task && task.status !== TaskStatus.Completed) {
                        await this.taskManager.completeTask(goalId);
                        // Check if all tasks in project are complete
                        const project = this.taskManager.getProject(task.projectId);
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
                    Logger.error(`Failed to mark task ${goalId} as complete: ${error}`);
                }
            }));
        }

        return {
            finished: true,
            needsUserInput: false,
            allowReplan: false,
            goal: result.summary,
            response: {
                message: result.summary,
                metadata: {
                    goalsUpdated: result.goalsUpdated,
                    goalsInProgress: result.goalsInProgress,
                    goalsCompleted: result.goalsCompleted
                }
            }
        };
    }
}
