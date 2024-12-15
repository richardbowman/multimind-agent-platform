import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/helpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { TaskManager } from 'src/tools/taskManager';
import { RESEARCHER_USER_ID, RESEARCH_MANAGER_USER_ID } from '../../helpers/config';
import { ResearchTask } from '../researchAssistant';
import { randomUUID } from 'crypto';
import { ResearchDecomposition } from '../../schemas/research-manager';

@StepExecutorDecorator('decompose-research', 'Break down research request into specific tasks')
export class ResearchDecompositionExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;
    private pendingTasks: Set<string> = new Set();

    constructor(llmService: ILLMService, taskManager: TaskManager) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.taskManager = taskManager;
    }

    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.ResearchDecomposition);
        const project = await this.taskManager.getProject(projectId);

        const systemPrompt = `
You are a research orchestrator. Follow these steps:
1) Restate the user's goal.
2) Analyze the request and explain how you will satisfy it.
3) Specify a MAXIMUM of ${process.env.MAX_RESEARCH_REQUESTS} research requests. Use as FEW AS POSSIBLE.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const result = await this.modelHelpers.generate<ResearchDecomposition>({
            message: goal,
            instructions
        });

        if (result.goal) {
            project.name = result.goal;
        }

        // Create research tasks and assign to researchers
        for (const task of result.researchRequested) {
            const taskId = randomUUID();
            const taskDescription = `${task} [${result.goal}]`;
            this.pendingTasks.add(taskId);
            await this.taskManager.addTask(
                project,
                new ResearchTask(taskId, projectId, taskDescription, RESEARCHER_USER_ID)
            );
        }

        return {
            type: "decompose-research",
            finished: false, // Don't mark as finished until researchers complete their work
            response: {
                message: `Research plan created:\n\n${result.strategy}\n\nTasks:\n${result.researchRequested.map(t => `- ${t}`).join('\n')}\n\nWaiting for researchers to complete their tasks...`,
                data: result
            }
        };
    }
}
    async onTaskNotification(task: Task): Promise<void> {
        if (task.complete && this.pendingTasks.has(task.id)) {
            this.pendingTasks.delete(task.id);
            
            // If all tasks are complete, we can mark this step as finished
            if (this.pendingTasks.size === 0) {
                const project = await this.taskManager.getProject(task.projectId);
                const decompositionTask = Object.values(project.tasks)
                    .find(t => t.type === 'decompose-research' && !t.complete);
                
                if (decompositionTask) {
                    await this.taskManager.completeTask(decompositionTask.id);
                }
            }
        }
    }
