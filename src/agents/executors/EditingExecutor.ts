import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/helpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { EditingResponse } from '../../schemas/editing';

@StepExecutorDecorator('editing', 'Review and improve content quality')
export class EditingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: ILLMService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = getGeneratedSchema(SchemaType.EditingResponse);

        const prompt = `You are a content editor.
Review the content for clarity, structure, style, and grammar.
Provide specific suggestions for improvements while maintaining the original message.

${previousResult ? `Review this content:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate<EditingResponse>({
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
