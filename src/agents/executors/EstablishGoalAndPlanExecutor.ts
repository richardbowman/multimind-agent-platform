import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StructuredOutputPrompt } from "../../llm/ILLMService";
import { ModelHelpers } from "../../llm/modelHelpers";
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { GoalAndPlanResponse } from "../../schemas/goalAndPlan";
import { getGeneratedSchema } from "../../helpers/schemaUtils";
import { SchemaType } from "../../schemas/SchemaTypes";
import { ExecutorType } from '../interfaces/ExecutorType';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResult } from '../interfaces/StepResult';
import { TaskManager } from 'src/tools/taskManager';
import { ChatClient } from 'src/chat/chatClient';
import { AddTaskParams, TaskType } from '../../tools/taskManager';

/**
 * Executor that establishes a goal and plan for the agent.
 * Key capabilities:
 * - Establishes the overall goal
 * - Plans the steps to achieve the goal
 * - Ensures clarity and completeness of the goal
 * - Provides structured feedback on the plan
 */
@StepExecutorDecorator(ExecutorType.ESTABLISH_GOAL_AND_PLAN, 'Establish the goal and plan for the agent.')
export class EstablishGoalAndPlanExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;
    private chatClient: ChatClient;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager;
        this.chatClient = params.chatClient;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.GoalAndPlanResponse);

        // Create prompt using PromptBuilder
        const promptBuilder = this.modelHelpers.createPrompt();
        
        // Add core instructions
        promptBuilder.addInstruction(this.modelHelpers.getFinalInstructions());

        // Add content sections
        const project = await this.taskManager.getProject(params.projectId);
        const activeMasterPlan = project.metadata.activeMasterPlan;

        // Only handle sub-plan if there is an active master plan
        if (activeMasterPlan) {
            promptBuilder.addContext(`ACTIVE MASTER PLAN: ${activeMasterPlan.goal}`);
            promptBuilder.addContext(`USER MESSAGE: ${params.message}`);

            promptBuilder.addInstruction(`IMPORTANT RESPONSE INSTRUCTIONS:
                YOU MUST ELIMINATE acronyms or other terminology that may be ambiguous or confusing to other agents.

                1. Review the active master plan: ${activeMasterPlan.goal}.
                2. Plan the sub-steps required to achieve the active master plan.
                3. Ensure the sub-steps are clear and unambiguous.
                4. Provide a structured response with the sub-plan.
            `);

            // Clear existing tasks if re-evaluating
            const currentTasks = (await this.taskManager.getProjectTasks(project.id)).filter(task => task.type === TaskType.Step);
            await Promise.all(currentTasks.map(task => this.taskManager.cancelTask(task.id)));

            // Create new tasks for the sub-plan
            if (result.subPlan && result.subPlan.plan) {
                result.subPlan.plan.forEach(async (step, index) => {
                    const newTask: AddTaskParams = {
                        type: TaskType.Step,
                        description: step.description,
                        creator: 'system',
                        order: index,
                        props: {
                            stepType: step.actionType
                        }
                    };
                    this.taskManager.addTask(await this.taskManager.getProject(params.projectId), newTask);
                });
            }

            return {
                finished: true,
                needsUserInput: false,
                replan: ReplanType.None,
                goal: result.subPlan?.goal,
                response: {
                    message: result.message
                }
            };
        }
            
        // Build and execute prompt
        const result = await this.modelHelpers.generate<GoalAndPlanResponse>({
            message: activeMasterPlan ? activeMasterPlan.goal : params.message,
            instructions: new StructuredOutputPrompt(schema, promptBuilder),
            threadPosts: params.context?.threadPosts || []
        });

        // Clear existing tasks if re-evaluating
        if (activeMasterPlan) {
            // Clear existing sub-plan tasks
            const project = await this.taskManager.getProject(params.projectId);
            const currentTasks = this.taskManager.getProjectTasks(project.id).filter(task => task.type === TaskType.Step);
            currentTasks.forEach(task => this.taskManager.cancelTask(task.id));

            // Create new tasks for the sub-plan
            if (result.subPlan && result.subPlan.plan) {
                result.subPlan.plan.forEach(async (step, index) => {
                    const newTask: AddTaskParams = {
                        type: TaskType.Step,
                        description: step.description,
                        creator: 'system',
                        order: index,
                        props: {
                            stepType: step.actionType
                        }
                    };
                    this.taskManager.addTask(await this.taskManager.getProject(params.projectId), newTask);
                });
            }
        } else if (!activeMasterPlan && result.masterPlan && result.masterPlan.plan) {
            // Create new tasks for the master plan
            result.masterPlan.plan.forEach(async (step, index) => {
                const newTask: AddTaskParams = {
                    type: TaskType.Step,
                    description: step.description,
                    creator: 'system',
                    order: index,
                    props: {
                        stepType: step.actionType
                    }
                };
                this.taskManager.addTask(await this.taskManager.getProject(params.projectId), newTask);
            });

            // Update project metadata with the active master plan
            project.metadata.activeMasterPlan = result.masterPlan;
            this.taskManager.replaceProject(project);
        }

        return {
            finished: true,
            needsUserInput: false,
            replan: ReplanType.None,
            goal: result.goal,
            response: {
                message: result.message
            }
        };
    }
}
