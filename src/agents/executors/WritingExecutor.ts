import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from '../../llm/lmstudioService';
import LMStudioService from '../../llm/lmstudioService';
import { ModelHelpers } from 'src/llm/helpers';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';
import { Project, Task, TaskManager } from 'src/tools/taskManager';
import { CONTENT_MANAGER_USER_ID, CONTENT_WRITER_USER_ID } from 'src/helpers/config';
import Logger from 'src/helpers/logger';

@StepExecutorDecorator('assign-writers', 'Take an existing outline and break out sections to writers.')
export class WritingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(llmService: LMStudioService, taskManager: TaskManager) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.taskManager = taskManager
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                sections: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            description: { type: "string" },
                            keyPoints: {
                                type: "array",
                                items: { type: "string" }
                            },
                            researchFindings: {
                                type: "array",
                                items: { 
                                    type: "object",
                                    properties: {
                                        finding: { type: "string" },
                                        source: { type: "string" }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            required: ["sections"]
        };

        const prompt = `You are planning content writing tasks.
Break down the content into sections that can be assigned to writers.
For each section, provide a clear title, description, key points to cover, and relevant research findings.

${previousResult ? `Use these materials to inform the task planning:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate({
            message: goal,
            instructions
        });

        // Create a new project and writing tasks for each section
        try {
            const newProjectId = this.taskManager.newProjectId();
            const writingProject : Project<Task> = {
                id: newProjectId,
                name: `Writing project: ${goal}`,
                tasks: {},
                metadata: {
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    status: 'active',
                    owner: CONTENT_MANAGER_USER_ID,
                    description: goal,
                    priority: 'medium'
                }
            };
            
            await this.taskManager.addProject(writingProject);

            for (const section of result.sections) {
                const task = await this.taskManager.addTask(writingProject, {
                    id: crypto.randomUUID(),
                    creator: CONTENT_MANAGER_USER_ID,
                    type: 'writing',
                    description: `# ${section.title}\n\n${section.description}\n\n## Key Points:\n${
                        section.keyPoints?.map(p => `- ${p}`).join('\n')||""
                    }\n\n## Research Findings:\n${
                        section.researchFindings?.map(f => `- ${f.finding}\n  Source: ${f.source}`).join('\n')||""
                    }`,
                    order: result.sections.indexOf(section)
                });

                await this.taskManager.assignTaskToAgent(task.id, CONTENT_WRITER_USER_ID);

                return {
                    type: "writing",
                    finished: false,
                    needsUserInput: true,
                    response: {
                        message: `Created ${result.sections.length} writing tasks:\n\n${
                            result.sections.map(s => `- ${s.title}`).join('\n')
                        }`,
                        data: result
                    },
                    projectId: writingProject.id
                };
            }
        } catch (error) {
            Logger.error('Error creating writing tasks:', error);
            throw error;
        }
    }
}
