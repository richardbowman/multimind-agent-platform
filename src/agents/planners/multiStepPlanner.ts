import { HandlerParams } from '../agents';
import { PlanStepsResponse } from '../../schemas/PlanStepsResponse';
import { ChatPost } from '../../chat/chatClient';
import { Planner } from './planner';
import { Task } from '../../tools/taskManager';
import { SchemaInliner } from '../../helpers/schemaInliner';
import * as schemaJson from "../../schemas/schema.json";
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { EXECUTOR_METADATA_KEY } from '../decorators/executorDecorator';
import { TaskManager } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import crypto from 'crypto';
import { ModelHelpers } from 'src/llm/modelHelpers';

export class MultiStepPlanner implements Planner {
    constructor(
        private llmService: ILLMService,
        private projects: TaskManager,
        private userId: string,
        private modelHelpers: ModelHelpers,
        private stepExecutors: Map<string, any> = new Map()
    ) {}

    public async planSteps(handlerParams: HandlerParams): Promise<PlanStepsResponse> {
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
            `## Completed Tasks\n${formatCompletedTasks(completedTasks)}\n\n` : 
            `## Completed Tasks\n*No completed tasks yet*\n\n`;

        const currentSteps = currentTasks.length > 0 ? 
            `## Current Plan\n${formatCurrentTasks(currentTasks)}\n\n` : 
            `## Current Plan\n*No tasks in current plan*\n\n`;

        const stepDescriptions = executorMetadata
            .filter(metadata => metadata.planner)
            .map(({ key, description }) => `[${key}]: ${description}`)
            .join("\n");

        //TODO: opportunity here to better organize context of the chat chain to include info
        const userContext = handlerParams.userPost?.message
            ? `CONTEXT: ${handlerParams.userPost.message}` 
            : '';

        const systemPrompt =
            `${this.modelHelpers.getPurpose()}

## HIGH-LEVEL GOAL: ${project.name}
${userContext}

## AVAILABLE ACTION TYPES (and descriptions of when to use them):
${stepDescriptions}

## TASK GOAL:
- If the user's high-level goal is not solved, look at the Current Plan and decide if you need to change anything to achieve the goal.
- If the current step is in-progress, don't remove it so it can process the new conversation from the user unless its clear we need to replan.

- Provide a complete plan of all steps INCLUDING EXISTING STEPS required using actions from the available action types in the order to perform.

${completedSteps}

${currentSteps}

## INSTRUCTIONS:
${this.modelHelpers.getFinalInstructions()}`;

        const response = await this.modelHelpers.generate<PlanStepsResponse>({
            ...handlerParams,
            instructions: new StructuredOutputPrompt(schema, systemPrompt)
        });

        Logger.verbose(`PlanStepsResponse: ${JSON.stringify(response, null, 2)}`);

        // Create a map of existing tasks by ID
        const existingTaskMap = new Map(
            tasks.map(task => [task.id, task])
        );

        if (Array.isArray(response.steps) && response.steps.length > 0) {
            // Track which tasks are mentioned in the response
            const mentionedTaskIds = new Set<string>();

            // Update task order and status based on response
            response.steps.forEach((step, index) => {
                if (step.existingId && existingTaskMap.has(step.existingId)) {
                    // Update existing task
                    const existingTask = existingTaskMap.get(step.existingId)!;
                    existingTask.order = index;
                    if (step.actionType) existingTask.type = step.actionType;
                    if (step.context) existingTask.description = step.context;
                    mentionedTaskIds.add(step.existingId);
                } else {
                    // Create new task
                    const newTask: Task = {
                        id: crypto.randomUUID(),
                        projectId: project.id,
                        type: step.actionType,
                        description: step.context || step.actionType,
                        creator: this.userId,
                        complete: false,
                        order: index
                    };
                    this.projects.addTask(project, newTask);
                }
            });

            // Mark unmentioned tasks as completed only if we got a valid steps list
            for (const [taskId, task] of existingTaskMap) {
                if (!mentionedTaskIds.has(taskId)) {
                    this.projects.completeTask(taskId);
                }
            }
        }

        return response;
    }
}
