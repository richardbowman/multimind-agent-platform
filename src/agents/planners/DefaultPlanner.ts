import { HandlerParams } from '../agents';
import { PlanStepsResponse } from '../schemas/PlanStepsResponse';
import { Planner } from './Planner';
import { Task } from '../../tools/taskManager';
import { SchemaInliner } from '../../helpers/schemaInliner';
import * as schemaJson from "../schemas/schema.json";
import LMStudioService, { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { TaskManager } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import crypto from 'crypto';

export class DefaultPlanner implements Planner {
    constructor(
        private lmStudioService: LMStudioService,
        private projects: TaskManager,
        private userId: string,
        private modelHelpers: { getPurpose: () => string },
        private stepExecutors: Map<string, any>,
        private finalInstructions: string = ""
    ) {}

    public async planSteps(handlerParams: HandlerParams): Promise<PlanStepsResponse> {
        const executorMetadata = Array.from(this.stepExecutors.entries()).map(([key, executor]) => {
            const metadata = Reflect.getMetadata('executor', executor.constructor);
            return {
                key,
                description: metadata?.description || 'No description available'
            };
        });

        const schema = new SchemaInliner(schemaJson).inlineReferences(schemaJson.definitions).PlanStepsResponse;

        const project = handlerParams.projects[0];
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
                return `- ${t.description}\n  ${type}\n  **ID**: ${t.id}`;
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
            .map(({ key, description }) => `${key}\n    Description: ${description}`)
            .join("\n\n");

        const systemPrompt =
            `${this.modelHelpers.getPurpose()}

HIGH-LEVEL GOAL: ${project.name}

The allowable step types you can execute in the plan:
${stepDescriptions}

TASK GOAL: If the user's high-level goal is not solved, your job is to create new steps to achieve the goal if they are missing, and reorder steps if needed to change priority.
Return a steps list in the order to perform.

${this.finalInstructions}`;

        const response: PlanStepsResponse = await this.lmStudioService.generate({
            ...handlerParams,
            instructions: new StructuredOutputPrompt(schema, systemPrompt)
        });

        Logger.info(`PlanStepsResponse: ${JSON.stringify(response, null, 2)}`);

        // Create a map of existing tasks by ID
        const existingTaskMap = new Map(
            tasks.map(task => [task.id, task])
        );

        // Track which tasks are mentioned in the response
        const mentionedTaskIds = new Set<string>();

        // Update task order and status based on response
        response.steps.forEach((step, index) => {
            if (step.existingId && existingTaskMap.has(step.existingId)) {
                // Update existing task
                const existingTask = existingTaskMap.get(step.existingId)!;
                existingTask.order = index;
                if (step.actionType) existingTask.type = step.actionType;
                if (step.parameters) existingTask.description = step.parameters;
                mentionedTaskIds.add(step.existingId);
            } else {
                // Create new task
                const newTask: Task = {
                    id: crypto.randomUUID(),
                    type: step.actionType,
                    description: step.parameters || step.actionType,
                    creator: this.userId,
                    complete: false,
                    order: index
                };
                this.projects.addTask(project, newTask);
            }
        });

        // Mark any tasks not mentioned in the response as completed
        for (const [taskId, task] of existingTaskMap) {
            if (!mentionedTaskIds.has(taskId)) {
                this.projects.completeTask(taskId);
            }
        }

        return response;
    }
}
