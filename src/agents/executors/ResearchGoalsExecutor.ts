import { ExecuteParams, StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "../../llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { TaskManager } from 'src/tools/taskManager';
import { ResearchUnderstandingResponse } from 'src/schemas/ResearchUnderstandingResponse';

@StepExecutorDecorator('understand-research-goals', 'Ensure research goals are clear and well-defined')
export class ResearchGoalsExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: ILLMService, private taskManager: TaskManager) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.ResearchUnderstandingResponse);

        const systemPrompt = `
As a research coordinator, try to build an effective research project that helps the users meet their goals.
If anything is ambiguous or missing critical details, identify specific questions needed.

Consider:
1. Is the scope clearly defined?
2. Are there any ambiguous terms or concepts?
3. Are the expected outcomes clear?
4. Is the context sufficient?
5. Are there any unstated assumptions that need verification?`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        // Include previous results in the context if available
        const previousContext = params.previousResult?.length > 0 ? 
            `\nPrevious findings:\n${params.previousResult[0].message || params.previousResult[0].reasoning}` : '';

        const result = await this.modelHelpers.generate<ResearchUnderstandingResponse>({
            message: `${params.goal}${previousContext}`,
            instructions
        });

        if (!result.proceedWithResearch && result.questions.length > 0) {
            return {
                type: "understand-research-goals",
                finished: false,
                needsUserInput: true,
                response: {
                    message: `Here is what I understand so far: ${result.goal} Before proceeding with the research, I need some clarification:\n\n${
                        result.questions.map((q, i) => `${i + 1}. ${q}`).join('\n\n')
                    }\n\nPlease provide answers to these questions so I can better understand your research needs.`
                }
            };
        }

        return {
            type: "understand-research-goals",
            finished: true,
            response: {
                message: `I understand your research goals:\n\n${result.goal}\n\nProceeding with research plan creation.`
            }
        };
    }
}
