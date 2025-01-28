import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResult, StepResultType } from '../interfaces/StepResult';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { FinalResponse } from '../../schemas/finalResponse';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ExecutorType } from '../interfaces/ExecutorType';
import { message } from 'blessed';
import { StringUtils } from 'src/utils/StringUtils';

/**
 * Executor that synthesizes all previous results into a final response.
 * Key capabilities:
 * - Combines results from multiple execution steps
 * - Creates coherent narrative from disparate sources
 * - Maintains clear source attribution
 * - Formats response in structured Markdown
 * - Preserves context from original goal
 * - Handles large result sets (16K token context)
 * - Provides comprehensive yet concise summaries
 * - Ensures all key points are addressed
 * - Maintains consistent formatting and style
 * - Includes relevant citations and references
 */
@StepExecutorDecorator(ExecutorType.FINAL_RESPONSE, 'Provide final response to the user (include at the end of your plan)')
export class FinalResponseExecutor implements StepExecutor {
    modelHelpers: ModelHelpers;
    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

    }

    async executeOld(goal: string, step: string, projectId: string, previousResults?: any[]): Promise<StepResult> {
        //const schema = await getGeneratedSchema(SchemaType.FinalResponse);

        const instructions = `You are an AI assistant generating a final response.
Synthesize all the intermediate results into a clear, comprehensive answer that addresses the original goal.
Include relevant details from all steps while maintaining clarity and coherence. Include your sources.`;

        const context = JSON.stringify({
            originalGoal: goal,
            previousResults
        }, null, 2);

        const response = await this.modelHelpers.generate({
            message: context,
            instructions
        });

        return {
            type: StepResultType.FinalResponse,
            finished: true,
            response: {
                message: response
            }
        };
    }
}
