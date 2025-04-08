import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { ReplanType, StepResponse, StepResult, StepResultType } from '../interfaces/StepResult';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ContentType } from 'src/llm/promptBuilder';
import { ModelType } from "src/llm/types/ModelType";
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';

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
export class ThinkingExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.ThinkingResponse);

        const promptBuilder = this.startModel(params);
        promptBuilder.addContext({contentType: ContentType.ABOUT});
        promptBuilder.addInstruction(`You are a thinking step in a broader agentic workflow.
Given a problem, break it down into logical steps and reason through it carefully.
Consider multiple angles and potential implications. You cannot run code, but you can recommend it (make sure to strongly recommend it in all caps).`);

        if (params.previousResponses) {
            promptBuilder.addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses});
        }

        promptBuilder.addContext({contentType: ContentType.GOALS_FULL, params});

        const result = await promptBuilder.generate({
            message: params.message,
            modelType: ModelType.ADVANCED_REASONING
        });

        return {
            type: StepResultType.Thinking,
            finished: true, 
            replan: ReplanType.Allow,
            response: {
                status: result.message
            }
        };
    }
}
