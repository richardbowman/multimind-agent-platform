import { ExecuteParams, StepExecutor, StepResult } from '../stepBasedAgent';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { ExecutorType } from './ExecutorType';
import { BrainstormResponse } from '../../schemas/BrainstormResponse';

@StepExecutorDecorator(ExecutorType.BRAINSTORM, 'Generate creative ideas and possibilities through brainstorming', false)
export class BrainstormExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = new ModelHelpers(params.llmService, 'executor');
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.BrainstormResponse);

        const prompt = `You are a creative brainstorming assistant.
Generate multiple innovative ideas related to the goal.
For each idea, provide a clear title, description, and potential benefits.
Try not to rule out ideas and focus on being creative.

After generating ideas, analyze if:
1. We have sufficient diversity of ideas across different approaches
2. We've covered all major aspects of the problem space
3. New ideas are becoming repetitive or less valuable

Based on this analysis, set isComplete to true if brainstorming should conclude, or false if more ideas are needed.

${params.previousResult ? `Build upon these previous ideas:\n${JSON.stringify(params.previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate<BrainstormResponse>({
            message: params.message || params.stepGoal,
            instructions
        });

        const formattedIdeas = result.ideas.map(idea => 
            `### ${idea.title}\n${idea.description}\n\n**Benefits:**\n${idea.benefits}`
        ).join('\n\n');

        return {
            type: "brainstorm",
            finished: result.isComplete,
            needsUserInput: !result.isComplete,
            response: {
                message: `**Brainstorming Results:**\n\n${formattedIdeas}\n\n**Summary:**\n${result.summary}`,
                isComplete: result.isComplete
            }
        };
    }
}
