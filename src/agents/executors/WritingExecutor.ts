import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from '../../llm/lmstudioService';
import LMStudioService from '../../llm/lmstudioService';
import { ModelHelpers } from 'src/llm/helpers';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';

@StepExecutorDecorator('writing', 'Write content sections based on outline and research')
export class WritingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: LMStudioService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
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
                            heading: { type: "string" },
                            content: { type: "string" },
                            citations: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        source: { type: "string" },
                                        reference: { type: "string" }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            required: ["sections"]
        };

        const prompt = `You are a content writer.
Given an outline and research findings, write detailed content sections.
Each section should be well-written, engaging, and properly cited when using research.

${previousResult ? `Use these materials to inform the writing:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate({
            message: goal,
            instructions
        });

        return {
            type: "writing",
            finished: true,
            response: {
                message: result.sections.map(s => 
                    `# ${s.heading}\n\n${s.content}\n\n${s.citations.length > 0 ? 
                        '**Citations:**\n' + s.citations.map(c => 
                            `- ${c.source}: ${c.reference}`
                        ).join('\n') : ''}`
                ).join('\n\n'),
                data: result
            }
        };
    }
}
