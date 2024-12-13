import { HandlerParams } from '../agents';
import { NextActionResponse } from '../../schemas/NextActionResponse';
import { Planner } from './Planner';
import { Task } from '../../tools/taskManager';
import { SchemaInliner } from '../../helpers/schemaInliner';
import * as schemaJson from "../../schemas/schema.json";
import LMStudioService, { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { TaskManager } from '../../tools/taskManager';
import Logger from '../../helpers/logger';
import crypto from 'crypto';
import { ModelHelpers } from 'src/llm/helpers';

export class SimpleNextActionPlanner implements Planner {
    constructor(
        private lmStudioService: LMStudioService,
        private projects: TaskManager,
        private userId: string,
        private modelHelpers: ModelHelpers,
        private stepExecutors: Map<string, any> = new Map()
    ) {}

    public async planSteps(handlerParams: HandlerParams): Promise<NextActionResponse> {
        const executorMetadata = Array.from(this.stepExecutors.entries()).map(([key, executor]) => {
            const metadata = Reflect.getMetadata('executor', executor.constructor);
            return {
                key,
                description: metadata?.description || 'No description available'
            };
        });

        const schema = new SchemaInliner(schemaJson).inlineReferences(schemaJson.definitions).NextActionResponse;

        const project = handlerParams.projects[0];
        const tasks = this.projects.getAllTasks(project.id);

        const formatCompletedTasks = (tasks: Task[]) => {
            return tasks.map(t => {
                const type = t.type ? `**Type**: ${t.type}` : '';
                return `- ${t.description}\n  ${type}`;
            }).join('\n');
        };

        const completedTasks = tasks.filter(t => t.complete);
        const currentTasks = tasks.filter(t => !t.complete);

        const completedSteps = completedTasks.length > 0 ? 
            `## Completed Tasks\n${formatCompletedTasks(completedTasks)}\n\n` : 
            `## Completed Tasks\n*No completed tasks yet*\n\n`;

        const stepDescriptions = executorMetadata
            .map(({ key, description }) => `${key}\n    Description: ${description}`)
            .join("\n\n");

        const systemPrompt =
            `${this.modelHelpers.getPurpose()}

HIGH-LEVEL GOAL: ${project.name}

The allowable step types you can execute:
${stepDescriptions}

TASK GOAL:
- Look at the completed tasks and determine ONE next action that would move us closer to the high-level goal
- Return exactly ONE step that should be performed next
- Be specific and actionable in the parameters

${completedSteps}

${this.modelHelpers.getFinalInstructions()}`;

        const response: NextActionResponse = await this.modelHelpers.generate({
            ...handlerParams,
            instructions: new StructuredOutputPrompt(schema, systemPrompt)
        });

        Logger.verbose(`NextActionResponse: ${JSON.stringify(response, null, 2)}`);

        // Create new task for the next action
        if (response.action) {
            const newTask: Task = {
                id: crypto.randomUUID(),
                type: response.action.actionType,
                description: response.action.parameters || response.action.actionType,
                creator: this.userId,
                complete: false,
                order: currentTasks.length // Add to end of current tasks
            };
            this.projects.addTask(project, newTask);
        }

        return response;
    }
}
