import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { Project, Task, TaskManager } from 'src/tools/taskManager';
import { RESEARCHER_USER_ID, RESEARCH_MANAGER_USER_ID } from '../../helpers/config';
import { ResearchTask } from '../researchAssistant';
import { randomUUID } from 'crypto';
import { ResearchDecomposition } from '../../schemas/research-manager';

@StepExecutorDecorator('decompose-research', 'Break down research request into specific tasks')
export class ResearchDecompositionExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(llmService: ILLMService, taskManager: TaskManager) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.taskManager = taskManager;
    }

    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.ResearchDecomposition);
        const project = await this.taskManager.getProject(projectId);
        const pendingTasks: Set<string> = new Set();

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

        const newProjectId = this.taskManager.newProjectId();
        const researchProject: Project<Task> = {
            id: newProjectId,
            name: `Research project: ${result.goal}`,
            tasks: {},
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                status: 'active',
                owner: RESEARCH_MANAGER_USER_ID,
                description: goal,
                priority: 'medium'
            }
        };

        await this.taskManager.addProject(researchProject);



        // Create research tasks and assign to researchers
        for (const researchRequest of result.researchRequested) {
            const id = randomUUID();
            const description = `${researchRequest} [${result.goal}]`;

            const task: Task = {
                id,
                type: "research",
                projectId,
                description,
                creator: RESEARCH_MANAGER_USER_ID
            }

            pendingTasks.add(id);

            await this.taskManager.addTask(
                researchProject,
                task
            );

            await this.taskManager.assignTaskToAgent(id, RESEARCHER_USER_ID);

        }

        return {
            type: "decompose-research",
            finished: false, // Don't mark as finished until researchers complete their work
            response: {
                message: `Research plan created:\n\n${result.strategy}\n\nTasks:\n${result.researchRequested.map(t => `- ${t}`).join('\n')}\n\nWaiting for researchers to complete their tasks...`,
                data: {
                    result,
                    researchTasks: pendingTasks
                }
            },
            projectId: researchProject.id
        };
    }


}