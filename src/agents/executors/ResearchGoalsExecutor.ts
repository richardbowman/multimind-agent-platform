import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { TaskManager } from 'src/tools/taskManager';

interface ResearchUnderstandingResponse {
    isUnderstandable: boolean;
    clarifyingQuestions: string[];
    understanding: string;
    reasoning: string;
}

@StepExecutorDecorator('understand-research-goals', 'Ensure research goals are clear and well-defined')
export class ResearchGoalsExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: ILLMService, private taskManager: TaskManager) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                isUnderstandable: {
                    type: "boolean",
                    description: "Whether the research request is clear enough to proceed"
                },
                clarifyingQuestions: {
                    type: "array",
                    items: {
                        type: "string"
                    },
                    description: "Questions needed to clarify the research goals"
                },
                understanding: {
                    type: "string",
                    description: "Your understanding of the research goals"
                },
                reasoning: {
                    type: "string",
                    description: "Explanation of why the request is or isn't clear enough"
                }
            },
            required: ["isUnderstandable", "clarifyingQuestions", "understanding", "reasoning"]
        };

        const systemPrompt = `
As a research coordinator, evaluate if the research request is clear enough to proceed.
If anything is ambiguous or missing critical details, identify specific questions needed.

Consider:
1. Is the scope clearly defined?
2. Are there any ambiguous terms or concepts?
3. Are the expected outcomes clear?
4. Is the context sufficient?
5. Are there any unstated assumptions that need verification?`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const result = await this.modelHelpers.generate<ResearchUnderstandingResponse>({
            message: goal,
            instructions
        });

        if (!result.isUnderstandable && result.clarifyingQuestions.length > 0) {
            return {
                type: "understand-research-goals",
                finished: false,
                needsUserInput: true,
                response: {
                    message: `Before proceeding with the research, I need some clarification:\n\n${
                        result.clarifyingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n\n')
                    }\n\nPlease provide answers to these questions so I can better understand your research needs.`
                }
            };
        }

        return {
            type: "understand-research-goals",
            finished: true,
            response: {
                message: `I understand your research goals:\n\n${result.understanding}\n\nProceeding with research plan creation.`
            }
        };
    }
}
