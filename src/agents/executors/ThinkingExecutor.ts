import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ThinkingResponse } from '../../schemas/thinking';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';

@StepExecutorDecorator('thinking', 'Develop ideas and reasoning through careful analysis and deep thinking')
export class ThinkingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: ILLMService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async executeOld(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.ThinkingResponse);

        const prompt = `You are a careful analytical thinker.
Given a problem, break it down into logical steps and reason through it carefully.
Consider multiple angles and potential implications.

${previousResult ? `Consider this previous result in your thinking:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate<ThinkingResponse>({
            message: goal,
            instructions
        });

        return {
            type: "thinking",
            finished: true,
            response: {
                message: `**Reasoning Process:**\n\n${result.reasoning}\n\n**Conclusion:**\n\n${result.conclusion}`
            }
        };
    }
}
