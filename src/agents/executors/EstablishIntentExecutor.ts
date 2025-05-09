import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { ModelHelpers } from "../../llm/modelHelpers";
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { IntentionsResponse } from "../../schemas/goalAndPlan";
import { getGeneratedSchema } from "../../helpers/schemaUtils";
import { SchemaType } from "../../schemas/SchemaTypes";
import { ExecutorType } from '../interfaces/ExecutorType';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from '../interfaces/StepResult';
import { ContentType } from 'src/llm/promptBuilder';
import { StringUtils } from 'src/utils/StringUtils';

/**
 * Executor that establishes the master plan for the agent.
 * Key capabilities:
 * - Establishes the overall goal
 * - Plans the steps required to achieve the goal
 * - Ensures clarity and completeness of the goal
 * - Provides structured feedback on the plan
 */
@StepExecutorDecorator(ExecutorType.ESTABLISH_INTENT, 'Establish your master intention (do this until a clear intention is established).')
export class EstablishIntentExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;

    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.IntentionsResponse);

        // Create prompt using PromptBuilder
        const promptBuilder = this.startModel(params);
        
        // Add core instructions
        promptBuilder.addContext({contentType: ContentType.ABOUT});
        promptBuilder.addContext({contentType: ContentType.EXECUTE_PARAMS, params});
        promptBuilder.addContext({contentType: ContentType.CHANNEL_GOALS, tasks: params.channelGoals});
        promptBuilder.addContext({contentType: ContentType.ARTIFACTS_TITLES, artifacts: params.context?.artifacts||[]});

        promptBuilder.addInstruction(`In this step, your goal is to establish the current overall intention for the agent. This
includes defining the overall goal and planning the steps required to achieve it. If the user's message doesn't help you determine
what your intention should be, consider any goals associated with the chat channel if they are provided.`);
           
        promptBuilder.addInstruction(`REQUIRED OUTPUT INSTRUCTIONS:
You **MUST ALWAYS** return your understanding of your current intentions and document ideas for how to try and achieve the intention.
Use an enclosed code block with the hidden indicator \`\`\`json[hidden] that matches this JSON Schema to express your intentions and plan. You can alter this later as the conversation evolves.:
\`\`\`schema
${JSON.stringify(schema, null, 2)}
\`\`\`

For example, if the user were to greet you in a new conversation, you might respond with:
Hi, thanks for trying Multimind. My goal is to help you get started. The #welcome channel is designed to help us build a comprehensive guide for agents based on your goals. In order to start,
my goal is to have you answer some questions in order for me to select an on-boarding template that will document our conversation for other agents.

\`\`\`json[hidden]
{
    "intention": "Help guide the user to select an appropriate document template so I can create a comprehensive guide for agents based on user goals",
    "plan": [
        "Based on the channel goal, try to guide the user so I can pick an onboarding template. Ask just enough questions to understand the user's high level goal."
    ],
    "currentFocus": 1
}
\'\'\'

`);

        // Build and execute prompt
        const result = await promptBuilder.generate({
            message: params.message
        });

        const planResponse = StringUtils.extractAndParseJsonBlock<IntentionsResponse>(result.message, schema);
        const message = StringUtils.extractNonCodeContent(result.message);

        return {
            type: StepResultType.GenerateIntention,
            finished: planResponse?.intention !== undefined,
            needsUserInput: planResponse?.intention == undefined,
            replan: ReplanType.None,
            goal: result.intention,
            response: {
                type: StepResponseType.Intent,
                message: message,
                data: planResponse
            }
        };
    }
}
