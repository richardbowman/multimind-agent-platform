import { StepExecutor, StepResult } from '../stepBasedAgent';
import { ModelMessageResponse } from '../../schemas/ModelResponse';
import { StructuredOutputPrompt } from '../../llm/lmstudioService';
import LMStudioService from '../../llm/lmstudioService';
import { ModelHelpers } from 'src/llm/helpers';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';

@StepExecutorDecorator('thinking', 'Develop ideas and reasoning through careful analysis and deep thinking')
export class ThinkingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: LMStudioService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                reasoning: {
                    type: "string",
                    description: "Step-by-step reasoning process"
                },
                conclusion: {
                    type: "string",
                    description: "Final conclusion based on the reasoning"
                }
            },
            required: ["reasoning", "conclusion"]
        };

        const prompt = `You are a careful analytical thinker.
Given a problem, break it down into logical steps and reason through it carefully.
Consider multiple angles and potential implications.

${previousResult ? `Consider this previous result in your thinking:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate({
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
