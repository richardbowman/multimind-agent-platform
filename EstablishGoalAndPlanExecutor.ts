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
import { ContentType } from 'src/llm/promptBuilder';
import { GoalAndPlanResponse } from "../../schemas/goalAndPlan";

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

    async execute(params: ExecuteParams): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.GoalAndPlanResponse);

        // Create prompt using PromptBuilder
        const promptBuilder = this.modelHelpers.createPrompt();
        
        // Add core instructions
        promptBuilder.addInstruction(this.modelHelpers.getFinalInstructions());

        // Add content sections
        promptBuilder.addContext(`USER MESSAGE: ${params.message}`);

        promptBuilder.addInstruction(`IMPORTANT RESPONSE INSTRUCTIONS:
            YOU MUST ELIMINATE acronyms or other terminology that may be ambiguous or confusing to other agents.

            1. Determine the overall goal for the user.
            2. Plan the steps required to achieve the goal.
            3. Ensure the goal and plan are clear and unambiguous.
            4. Provide a structured response with the goal and plan.`);
            
        // Build and execute prompt
        const result = await this.modelHelpers.generate<GoalAndPlanResponse>({
            message: params.message,
            instructions: new StructuredOutputPrompt(schema, promptBuilder),
            threadPosts: params.context?.threadPosts || []
        });

        if (result.goal && result.plan) {
            // Create new tasks for the plan
            result.plan.forEach((step, index) => {
                const newTask: AddTaskParams = {
                    type: TaskType.Step,
                    description: step.description,
                    creator: this.taskManager.newUUID(),
                    order: index,
                    props: {
                        stepType: step.actionType
                    }
                };
                this.taskManager.addTask(this.taskManager.getProject(params.projectId), newTask);
            });
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
