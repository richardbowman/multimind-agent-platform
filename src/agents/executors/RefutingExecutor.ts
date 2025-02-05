import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ReplanType, StepResult } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ILLMService } from '../../llm/ILLMService';
import { RefutingResponse } from '../../schemas/refuting';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ExecutorType } from '../interfaces/ExecutorType';

/**
 * Executor that critically analyzes arguments and identifies potential flaws.
 * Key capabilities:
 * - Generates counterarguments to challenge assumptions
 * - Evaluates logical consistency of arguments
 * - Identifies hidden assumptions and biases
 * - Provides balanced analysis of opposing viewpoints
 * - Assesses evidence quality and relevance
 * - Suggests alternative perspectives
 * - Delivers structured critique with final verdict
 * - Maintains objective analytical approach
 */
@StepExecutorDecorator(ExecutorType.REFUTING, 'Challenge assumptions and identify potential flaws in the current reasoning')
export class RefutingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

    }

    async executeOld(goal: string, step: string, projectId: string, previousResponses?: any): Promise<StepResult<StepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.RefutingResponse);

        const prompt = `You are a critical thinker tasked with finding potential flaws in an argument or conclusion.
Think deeply about the problem and explain detailed reasoning in the response. Consider possible counterarguments and evaluate their validity.
Provide a balanced analysis and final verdict.

${previousResponses ? `Specifically analyze these previous conclusions:\n${JSON.stringify(previousResponses, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate<RefutingResponse>({
            message: goal,
            instructions
        });

        const counterargumentsList = result.counterarguments
            .map((arg: string) => `- ${arg}`).join('\n');

        return {
            type: "refuting",
            finished: true,
            replan: ReplanType.Allow,
            response: {
                message: `**Potential Counterarguments:**\n${counterargumentsList}\n\n**Analysis:**\n${result.analysis}\n\n**Final Verdict:**\n${result.finalVerdict}`
            }
        };
    }
}
