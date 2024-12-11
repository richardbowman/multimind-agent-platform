import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from '../../llm/lmstudioService';
import LMStudioService from '../../llm/lmstudioService';
import { ModelHelpers } from 'src/llm/helpers';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';
import { TaskManager } from 'src/tools/taskManager';
import { CONTENT_WRITER_USER_ID } from 'src/helpers/config';
import Logger from 'src/helpers/logger';

@StepExecutorDecorator('writing', 'Assign content writing tasks to content writer')
export class WritingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(llmService: LMStudioService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.taskManager = new TaskManager();
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

        // Create writing tasks for each section
        try {
            for (const section of result.sections) {
                const taskId = await this.taskManager.addTask({
                    projectId,
                    type: 'writing',
                    title: section.title,
                    description: `# ${section.title}\n\n${section.description}\n\n## Key Points:\n${
                        section.keyPoints.map(p => `- ${p}`).join('\n')
                    }\n\n## Research Findings:\n${
                        section.researchFindings.map(f => `- ${f.finding}\n  Source: ${f.source}`).join('\n')
                    }`,
                    order: result.sections.indexOf(section)
                });

                await this.taskManager.assignTaskToAgent(taskId, CONTENT_WRITER_USER_ID);
            }
        } catch (error) {
            Logger.error('Error creating writing tasks:', error);
            throw error;
        }

        return {
            type: "writing",
            finished: true,
            response: {
                message: `Created ${result.sections.length} writing tasks:\n\n${
                    result.sections.map(s => `- ${s.title}`).join('\n')
                }`,
                data: result
            }
        };
    }
}
