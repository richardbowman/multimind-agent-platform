import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { BaseStepExecutor, StepExecutor } from "../interfaces/StepExecutor";
import { ReplanType, StepResponse, StepResponseType, StepResult } from "../interfaces/StepResult";
import { ModelHelpers } from "src/llm/modelHelpers";
import { ContentType, globalRegistry, OutputType } from "src/llm/promptBuilder";
import { ModelType } from "src/llm/types/ModelType";
import { ExecutorType } from "../interfaces/ExecutorType";

@StepExecutorDecorator(ExecutorType.LIST_AGENT_CAPABILITIES, 'List available agents and their capabilities')
export class ListAgentCapabilitiesExecutor extends BaseStepExecutor<StepResponse> {
    constructor(params: ExecutorConstructorParams) {
        super(params);
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        // Create prompt with agent capabilities context
        const prompt = this.startModel(params);
        prompt.addInstruction(`Provide a clear summary of the available agents and their capabilities to help the user understand who can assist with what.`)
            .addContext({contentType: ContentType.CHANNEL_AGENT_CAPABILITIES, agents: params.agents});

        try {
            const result = await prompt.generate({
                message: params.message || "List available agents and their capabilities",
                instructions: prompt,
                modelType: ModelType.CONVERSATION
            });

            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.AgentCapabilities,
                    status: result.message
                }
            };
        } catch (error) {
            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.AgentCapabilities,
                    status: 'Failed to list agent capabilities. Please try again later.'
                }
            };
        }
    }
}
