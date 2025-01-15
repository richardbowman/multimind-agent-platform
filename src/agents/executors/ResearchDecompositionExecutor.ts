import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult, StepResultType } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { Project, Task, TaskManager, TaskType } from 'src/tools/taskManager';
import { randomUUID } from 'crypto';
import { ResearchDecomposition } from '../../schemas/research-manager';
import { ModelResponse } from 'src/schemas/ModelResponse';
import { ExecutorType } from '../interfaces/ExecutorType';
import { TaskCategories } from '../interfaces/taskCategories';

/**
 * Executor that breaks down research requests into manageable tasks.
 * Key capabilities:
 * - Analyzes complex research goals and requirements
 * - Decomposes goals into specific research tasks
 * - Creates structured research plans with clear objectives
 * - Assigns tasks to appropriate research agents
 * - Manages task dependencies and sequencing
 * - Tracks research project progress
 * - Coordinates between multiple research agents
 * - Ensures comprehensive coverage of research topics
 * - Maintains research context across tasks
 * - Handles both broad and focused research requests
 */
@StepExecutorDecorator(ExecutorType.RESEARCH_DECOMPOSITION, 'Break down research request into specific tasks')
export class ResearchDecompositionExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.taskManager = params.taskManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const { goal, projectId, previousResult } = params;
        
        // Extract any relevant context from previous results
        const previousContext = previousResult?.length ? previousResult
            .map(function processContext<M extends ModelResponse>(result: M) { return result.reasoning || result.message })
            .filter(Boolean)
            .join('\n\n') : '';
        const schema = await getGeneratedSchema(SchemaType.ResearchDecomposition);
        const project = await this.taskManager.getProject(projectId);
        const pendingTasks: Set<string> = new Set();

        const systemPrompt = `
You are a Web Research manager. You develop a list of one or more search requests for your team of research assistants that will summarize websites from the results. Make sure each research request is complete with
all details necessary to perform a high quality Web-based search. Make sure they are not duplicative.

Follow these steps:
1) Restate the user's goal.
2) Consider the previous research context provided (if any).
3) Analyze the request and explain how you will satisfy it.
4) Specify a MAXIMUM of ${process.env.MAX_RESEARCH_REQUESTS} research requests. Use as FEW AS POSSIBLE.

Previous research context:
${previousContext}`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const result = await this.modelHelpers.generate<ResearchDecomposition>({
            message: `${goal}\n\nConsider this previous context when planning the research:\n${previousContext}`,
            instructions
        });

        if (result.goal) {
            project.name = result.goal;
        }

        const newProjectId = this.taskManager.newProjectId();
        const researchProject: Project = {
            id: newProjectId,
            name: `Research project: ${result.goal}`,
            tasks: {},
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                status: 'active',
                owner: params.agentId,
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
                type: TaskType.Standard,
                category: TaskCategories.WebResearch,
                projectId,
                description,
                creator: params.agentId
            }

            pendingTasks.add(id);

            await this.taskManager.addTask(
                researchProject,
                task
            );

            //TODO: major todo, figure out task delegation
            await this.taskManager.assignTaskToAgent(id, "rg7fwbna43byucb174hm7nnuwr");

        }

        return {
            type: StepResultType.DecomposeResearch,
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
