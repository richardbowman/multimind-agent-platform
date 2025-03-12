import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { ReplanType, StepResponse, StepResponseType, StepResult } from "../interfaces/StepResult";
import { ModelHelpers } from "src/llm/modelHelpers";
import { ContentType, globalRegistry } from "src/llm/promptBuilder";
import { ModelType } from "src/llm/LLMServiceFactory";
import { ExecutorType } from "../interfaces/ExecutorType";
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { StringUtils } from 'src/utils/StringUtils';

export interface SuggestedResponse {
    response: string;
    intent: string;
}

export interface SuggestedResponsesStepResponse extends StepResponse {
    type: StepResponseType.SuggestedResponses;
    data?: {
        suggestions: SuggestedResponse[];
        reasoning: string;
    };
}

@StepExecutorDecorator(ExecutorType.SUGGESTED_RESPONSES, 'Generate suggested user responses based on conversation context')
export class GenerateSuggestedResponsesExecutor implements StepExecutor<SuggestedResponsesStepResponse> {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        globalRegistry.stepResponseRenderers.set(StepResponseType.SuggestedResponses, async (response: StepResponse) => {
            const suggestions = response.data?.suggestions;
            return suggestions?.map((s, i) => 
                `SUGGESTED RESPONSE ${i + 1}:\n` +
                `Intent: ${s.intent}\n` +
                `Response: ${s.response}\n`
            ).join("\n") || "[NO SUGGESTED RESPONSES]";
        });
    }

    async execute(params: ExecuteParams): Promise<StepResult<SuggestedResponsesStepResponse>> {
        // Generate structured prompt
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`Your task is to generate 3-5 suggested responses a user might give based on the current conversation context.`);
        prompt.addContext({contentType: ContentType.PURPOSE});
        prompt.addContext({contentType: ContentType.GOALS_FULL, params});
        prompt.addContext({contentType: ContentType.EXECUTE_PARAMS, params});
        
        const schema = await getGeneratedSchema(SchemaType.SuggestedResponses);
        
        prompt.addInstruction(`OUTPUT INSTRUCTIONS:
1. Include a JSON object in your response, enclosed in a \`\`\`json code block matching this schema:
${JSON.stringify(schema, null, 2)}
2. Each response should be natural and conversational
3. Include a clear intent for each suggested response
4. Provide reasoning for why these responses were chosen`);

        try {
            const unstructuredResult = await this.modelHelpers.generate({
                message: params.message || params.stepGoal,
                instructions: prompt,
                threadPosts: params.context?.threadPosts,
                modelType: ModelType.CONVERSATION
            });

            const json = StringUtils.extractAndParseJsonBlock<{suggestions: SuggestedResponse[], reasoning: string}>(unstructuredResult.message, schema);
            
            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.SuggestedResponses,
                    status: `Generated ${json?.suggestions.length || 0} suggested responses`,
                    data: {
                        suggestions: json?.suggestions || [],
                        reasoning: json?.reasoning || "No reasoning provided"
                    }
                }
            };
        } catch (error) {
            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.SuggestedResponses,
                    status: 'Failed to generate suggested responses. Please try again later.'
                }
            };
        }
    }
}
