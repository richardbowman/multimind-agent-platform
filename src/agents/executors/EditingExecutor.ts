import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from '../../llm/lmstudioService';
import LMStudioService from '../../llm/lmstudioService';
import { ModelHelpers } from 'src/llm/helpers';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';

@StepExecutorDecorator('editing', 'Review and improve content quality')
export class EditingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: LMStudioService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                improvements: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            section: { type: "string" },
                            suggestions: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        type: { 
                                            type: "string",
                                            enum: ["clarity", "structure", "style", "grammar"]
                                        },
                                        original: { type: "string" },
                                        improved: { type: "string" },
                                        explanation: { type: "string" }
                                    }
                                }
                            }
                        }
                    }
                },
                overallFeedback: { type: "string" }
            },
            required: ["improvements", "overallFeedback"]
        };

        const prompt = `You are a content editor.
Review the content for clarity, structure, style, and grammar.
Provide specific suggestions for improvements while maintaining the original message.

${previousResult ? `Review this content:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate({
            message: goal,
            instructions
        });

        return {
            type: "editing",
            finished: true,
            response: {
                message: `**Content Review**\n\n${result.improvements.map(imp => 
                    `### ${imp.section}\n\n${imp.suggestions.map(s =>
                        `**${s.type}**:\n- Original: ${s.original}\n- Improved: ${s.improved}\n- Why: ${s.explanation}`
                    ).join('\n\n')}`
                ).join('\n\n')}\n\n**Overall Feedback:**\n${result.overallFeedback}`,
                data: result
            }
        };
    }
}
