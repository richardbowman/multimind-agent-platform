import { ExecutorConstructorParams } from '../ExecutorConstructorParams';
import { StepExecutor } from '../StepExecutor';
import { ExecuteParams } from '../ExecuteParams';
import { StepResult } from '../StepResult';
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
    taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = new ModelHelpers(params.llmService, 'executor');
        this.taskManager = params.taskManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.ResearchUnderstandingResponse);

        const previousContext = params.previousResult && params.previousResult.length > 0 ? 
        `\nPrevious findings:\n${params.previousResult[0].message || params.previousResult[0].reasoning}` : '';

        const systemPrompt = `
As a research coordinator, try to build an effective research project that helps the users meet their goals.
When details are ambiguous or missing, propose specific details and make educated assumptions to move the project forward.

Consider:
1. What specific scope boundaries can we assume?
2. What technical or domain-specific interpretations should we make?
3. What timeline or resource constraints might be reasonable?
4. What methodological approaches would be most appropriate?
5. What success criteria can we establish?

For each proposed detail:
- Explain why it matters
- Rate your confidence in the assumption
- Provide reasoning that the user can correct if needed

Goal: ${params.goal}
Previous Context: ${previousContext}

In your response, provide a fully restated goal incorporating your proposed details. This will be used to decompose the project.
`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        // Include previous results in the context if available

        const result = await this.modelHelpers.generate<ResearchUnderstandingResponse>({
            message: `${params.message}`,
            instructions
        });

        if (!result.proceedWithResearch && result.proposedDetails.length > 0) {
            const detailsList = result.proposedDetails
                .map((d, i) => `${i + 1}. ${d.detail}\n   Confidence: ${Math.round(d.confidence * 100)}%\n   Reasoning: ${d.reasoning}`)
                .join('\n\n');
                
            return {
                type: "understand-research-goals",
                finished: false,
                needsUserInput: true,
                response: {
                    message: `Here is what I understand so far: ${result.goal}\n\nI've made the following assumptions to clarify the scope. Please correct any that don't align with your intentions:\n\n${detailsList}\n\nPlease confirm or adjust these details so we can proceed with your research.`
                }
            };
        }

        return {
            type: "understand-research-goals",
            finished: true,
            response: {
                message: `I understand your research goals:\n\n${result.goal}\n\nProceeding with research plan creation.`
            },
            goal: result.goal
        };
    }
}
