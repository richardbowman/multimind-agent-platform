import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ReplanType, StepResponse, StepResult, StepResultType } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ThinkingResponse } from '../../schemas/thinking';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ContentType } from 'src/llm/promptBuilder';
import { ModelType } from 'src/llm/LLMServiceFactory';
import { ExecuteParams } from '../interfaces/ExecuteParams';

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
export class ThinkingExecutor implements StepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.ThinkingResponse);

        const promptBuilder = this.modelHelpers.createPrompt();
        promptBuilder.addContext({contentType: ContentType.ABOUT});
        promptBuilder.addInstruction(`You are a thinking step in a broader agentic workflow.
Given a problem, break it down into logical steps and reason through it carefully.
Consider multiple angles and potential implications. You cannot run code, but you can recommend it (make sure to strongly recommend it in all caps).`);

        if (params.previousResponses) {
            promptBuilder.addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses});
        }

        promptBuilder.addContext({contentType: ContentType.GOALS_FULL, params});

        const result = await this.modelHelpers.generate<ThinkingResponse>({
            message: params.message,
            instructions: new StructuredOutputPrompt(schema, promptBuilder.build()),
            modelType: ModelType.ADVANCED_REASONING
        });

        return {
            type: StepResultType.Thinking,
            finished: true, 
            replan: ReplanType.Allow,
            response: {
                status: `**Reasoning Process:**\n\n${result.reasoning}\n\n**Conclusion (so far):**\n\n${result.conclusion}`
            }
        };
    }
}
