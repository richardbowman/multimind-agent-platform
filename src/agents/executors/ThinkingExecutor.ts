import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResult, StepResultType } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ThinkingResponse } from '../../schemas/thinking';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ContentType } from 'src/llm/promptBuilder';

/**
 * Executor that performs deep analytical thinking and reasoning.
 * Key capabilities:
 * - Breaks down complex problems into logical components
 * - Analyzes problems from multiple perspectives
 * - Develops structured reasoning chains
 * - Evaluates potential implications and outcomes
 * - Generates detailed thought processes
 * - Provides clear reasoning explanations
 * - Considers alternative viewpoints
 * - Draws well-supported conclusions
 * - Maintains logical consistency
 * - Documents thinking steps clearly
 */
@StepExecutorDecorator(ExecutorType.THINKING, 'Develop ideas and reasoning through careful analysis and deep thinking')
export class ThinkingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

    }

    async executeOld(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.ThinkingResponse);

        const promptBuilder = this.modelHelpers.createPrompt();
        promptBuilder.addInstruction(`You are a careful analytical thinker.
Given a problem, break it down into logical steps and reason through it carefully.
Consider multiple angles and potential implications.`);

        if (previousResult) {
            promptBuilder.addContent(ContentType.STEP_RESULTS, [{
                props: {
                    result: previousResult
                }
            }]);
        }

        const result = await this.modelHelpers.generate<ThinkingResponse>({
            message: goal,
            instructions: new StructuredOutputPrompt(schema, promptBuilder.build())
        });

        return {
            type: StepResultType.Thinking,
            finished: true,
            response: {
                message: `**Reasoning Process:**\n\n${result.reasoning}\n\n**Conclusion (so far):**\n\n${result.conclusion}`
            }
        };
    }
}
