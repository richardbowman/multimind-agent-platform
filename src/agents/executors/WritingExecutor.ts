import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { Project, ProjectMetadata, Task, TaskManager, TaskType } from 'src/tools/taskManager';
import Logger from 'src/helpers/logger';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { WritingResponse } from '../../schemas/writing';
import { ExecutorType } from '../interfaces/ExecutorType';
import { TaskCategories } from '../interfaces/taskCategories';
import { createUUID } from 'src/types/uuid';

/**
 * Executor that manages content writing task assignments and coordination.
 * Key capabilities:
 * - Breaks down content outlines into assignable sections
 * - Creates structured writing tasks with clear objectives
 * - Assigns tasks to appropriate content writers
 * - Tracks task dependencies and sequencing
 * - Provides section-specific context and requirements
 * - Manages writing project workflow
 * - Coordinates multiple writer contributions
 * - Ensures consistent content style
 * - Preserves research context in assignments
 * - Maintains project-wide content strategy
 */
@StepExecutorDecorator(ExecutorType.WRITING, 'Take an existing outline and break out sections to writers.')
export class AssignWritersExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.taskManager = params.taskManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.WritingResponse);

        const prompt = `You are planning content writing tasks.
Break down the content into sections that can be assigned to writers.
For each section, provide a clear title, description, key points to cover, and relevant research findings.

${params.previousResult ? `Use these materials to inform the task planning:\n${JSON.stringify(params.previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate<WritingResponse>({
            message: params.goal,
            instructions
        });

        // Create a new project and writing tasks for each section
        try {
            const newProjectId = this.taskManager.newProjectId();
            
            const writingProject = await this.taskManager.addProject({
                id: newProjectId,
                name: `Writing project: ${params.goal}`,
                tasks: {},
                metadata: {
                    owner: params.agentId,
                    description: params.goal,
                    parentTaskId: params.stepId
                }
            });

            for (const section of result.sections) {
                const task = await this.taskManager.addTask(writingProject, {
                    id: createUUID(),
                    creator: params.agentId,
                    type: TaskType.Standard,
                    category: TaskCategories.Writing,
                    description: `Using the overall goal ${params.goal}, develop a section for the overall document.

Overall Outline:
${result.sections.map(s => `- ${s.title}`).join('\n')}

Your Section:
Header: ${section.title}
${section.description}

Key Points:
${section.keyPoints?.map(p => `- ${p}`).join('\n')||"None provided"}

Research Findings:
${section.researchFindings?.map(f => `- ${f.finding}\n  Source: ${f.source}`).join('\n')||"None provided"}`,
                    order: result.sections.indexOf(section)
                });

                //TODO: need to find way to get other user id
                await this.taskManager.assignTaskToAgent(task.id, "66025743-45bc-4625-a27f-52aa09dde128");
            }

            return {
                type: "writing",
                finished: false,
                async: true,
                response: {
                    message: `Created ${result.sections.length} writing tasks:\n\n${
                        result.sections.map(s => `- ${s.title}`).join('\n')
                    }`,
                    data: result
                },
                projectId: writingProject.id
            };
        } catch (error) {
            Logger.error('Error creating writing tasks:', error);
            throw error;
        }
    }
}
