import { HandlerParams } from '../agents';
import { PlanStepsResponse } from '../../schemas/PlanStepsResponse';
import { ChatPost } from '../../chat/chatClient';
import { Planner } from './planner';
import { AddTaskParams, Task, TaskType } from '../../tools/taskManager';
import { SchemaInliner } from '../../helpers/schemaInliner';
import * as schemaJson from "../../schemas/schema.json";
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { EXECUTOR_METADATA_KEY } from '../decorators/executorDecorator';
import { TaskManager } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import crypto from 'crypto';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepTask } from '../interfaces/ExecuteStepParams';

export class MultiStepPlanner implements Planner {
    constructor(
        private llmService: ILLMService,
        private projects: TaskManager,
        private userId: string,
        private modelHelpers: ModelHelpers,
        private stepExecutors: Map<string, any> = new Map()
    ) {}

    public async planSteps(handlerParams: HandlerParams): Promise<PlanStepsResponse> {
        Logger.progress(`Planning steps for ${handlerParams.userPost.message}`);

        const executorMetadata = Array.from(this.stepExecutors.entries())
            .map(([key, executor]) => {
                const metadata = Reflect.getMetadata(EXECUTOR_METADATA_KEY, executor.constructor);
                return {
                    key,
                    description: metadata?.description || 'No description available',
                    planner: metadata?.planner !== false // Default to true if not specified
                };
            })
            .filter(metadata => metadata.planner); // Only include executors marked for planner

        const schema = new SchemaInliner(schemaJson).inlineReferences(schemaJson.definitions).PlanStepsResponse;

        const project = handlerParams.projects?.[0];

        if (!project) {
            throw new Error(`Project not found`);
        }

        const tasks = this.projects.getAllTasks(project.id);

        const formatCompletedTasks = (tasks: Task[]) => {
            return tasks.map(t => {
                const type = t.type ? `**Type**: ${t.type}` : '';
                return `- ${t.description}\n  ${type}`;
            }).join('\n');
        };

        const formatCurrentTasks = (tasks: Task[]) => {
            return tasks.map(t => {
                const type = t.type ? `**Type**: ${t.type}` : '';
                const status = t.inProgress ? '🔄 *In Progress*' : '';
                return `- ${t.description}\n  ${type}\n  **ID**: ${t.id}${status ? `\n  ${status}` : ''}`;
            }).join('\n');
        };

        const completedTasks = tasks.filter(t => t.complete);
        const currentTasks = tasks.filter(t => !t.complete);

        const completedSteps = completedTasks.length > 0 ? 
            formatCompletedTasks(completedTasks) : 
            `*No completed tasks yet*`;

        const currentSteps = currentTasks.length > 0 ? 
            formatCurrentTasks(currentTasks) : 
            `*No tasks in current plan*`;

        const stepDescriptions = executorMetadata
            .filter(metadata => metadata.planner)
            .map(({ key, description }) => `[${key}]: ${description}`)
            .join("\n");

        //TODO: opportunity here to better organize context of the chat chain to include info
        const userContext = handlerParams.userPost?.message
            ? `CONTEXT: ${handlerParams.userPost.message}` 
            : '';

        // Get all available sequences
        const sequences = this.modelHelpers.getStepSequences();
        
        const sequencesPrompt = sequences.map(seq => 
            `### ${seq.getName()} Sequence (${seq.getDescription()}):
${seq.getAllSteps().map((step, i) => `${i + 1}. [${step.type}]: ${step.description}`).join('\n')}`
        ).join('\n\n');

        const systemPrompt =
            `## YOUR GOAL
You are a step that is a part of a multi-step agent workflow. Your task is to generate a proposed plan of upcoming steps that will best achieve
the goal from the available list of steps this agent has access to perform.

## OVERALL AGENT PURPOSE:
${this.modelHelpers.getPurpose()}

## HIGH-LEVEL USER GOAL: ${project.name}
${userContext}

## AVAILABLE SEQUENCES:
${sequencesPrompt}

## AVAILABLE ACTION TYPES (and descriptions of when to use them):
${stepDescriptions}

## TASK GOAL:
- If the user's high-level goal is not solved, review the Current Plan and generate a new plan to solve the goal.
- If the current step is in-progress, ensure this is the first step in the new plan.
- Provide a complete plan of all steps including incomplete using actions from the available action types in the order to perform.
- Prefer following the standard sequence when appropriate.

## COMPLETED TASKS:
${completedSteps}

## CURRENT PLAN:
${currentSteps}`;

        const response = await this.modelHelpers.generate<PlanStepsResponse>({
            ...handlerParams,
            instructions: new StructuredOutputPrompt(schema, systemPrompt)
        });

        Logger.verbose(`PlanStepsResponse: ${JSON.stringify(response, null, 2)}`);

        // Create a map of existing tasks by ID
        const existingTaskMap = new Map(
            tasks.map(task => [task.id, task as StepTask])
        );

        if (Array.isArray(response.steps) && response.steps.length > 0) {
            // mark all incomplete tasks complete to recreate based on planning
            const incompleteTasks = tasks.filter(t => !t.complete);
            for (const task of incompleteTasks) {
                this.projects.completeTask(task.id);
            }

            // Track which tasks are mentioned in the response
            // const mentionedTaskIds = new Set<string>();

            // Update task order and status based on response
            response.steps.forEach((step, index) => {
                // if (step.existingId && existingTaskMap.has(step.existingId)) {
                //     // Update existing task
                //     this.projects.updateTask(step.existingId, {
                //         order: index,
                //         stepType: step.actionType,
                //         description: step.context
                //     } as Partial<StepTask>)
                //     mentionedTaskIds.add(step.existingId);
                // } else {
                    // Create new task
                    const newTask: AddTaskParams = {
                        type: TaskType.Step,
                        description: step.context || step.actionType,
                        creator: this.userId,
                        complete: false,
                        order: index,
                        props: {
                            stepType: step.actionType
                        }
                    };
                    this.projects.addTask(project, newTask);
                // }
            });

            // Mark unmentioned tasks as completed only if we got a valid steps list
            // for (const [taskId, task] of existingTaskMap) {
            //     if (!mentionedTaskIds.has(taskId)) {
            //         this.projects.completeTask(taskId);
            //     }
            // }
        }

        return response;
    }
}
