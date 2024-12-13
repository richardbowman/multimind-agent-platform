import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { ModelHelpers } from '../../llm/helpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ILLMService } from '../../llm/ILLMService';
import { RefutingResponse } from '../../schemas/refuting';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';

@StepExecutorDecorator('refuting', 'Challenge assumptions and identify potential flaws in the current reasoning')
export class RefutingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: ILLMService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.Refuting);

        const prompt = `You are a critical thinker tasked with finding potential flaws in an argument or conclusion.
Think deeply about the problem and explain detailed reasoning in the response. Consider possible counterarguments and evaluate their validity.
Provide a balanced analysis and final verdict.

${previousResult ? `Specifically analyze these previous conclusions:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate<RefutingResponse>({
            message: goal,
            instructions
        });

        const counterargumentsList = result.counterarguments
            .map((arg: string) => `- ${arg}`).join('\n');

        return {
            type: "refuting",
            finished: true,
            response: {
                message: `**Potential Counterarguments:**\n${counterargumentsList}\n\n**Analysis:**\n${result.analysis}\n\n**Final Verdict:**\n${result.finalVerdict}`
            }
        };
    }
}
