import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { FinalResponse } from '../../schemas/finalResponse';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ModelHelpers } from 'src/llm/modelHelpers';

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
import { ExecutorType } from './ExecutorType';

@StepExecutorDecorator(ExecutorType.FINAL_RESPONSE, 'Provide final response to the user (include at the end of your plan)')
export class FinalResponseExecutor implements StepExecutor {
    constructor(private modelHelpers: ModelHelpers) {
    }

    async executeOld(goal: string, step: string, projectId: string, previousResults?: any[]): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.FinalResponse);

        const systemPrompt = `You are an AI assistant generating a final response.
Synthesize all the intermediate results into a clear, comprehensive answer that addresses the original goal.
Include relevant details from all steps while maintaining clarity and coherence. Include your sources.
You will respond inside of the message key in Markdown format.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const context = JSON.stringify({
            originalGoal: goal,
            previousResults
        }, null, 2);

        const response = await this.modelHelpers.generate<FinalResponse>({
            message: context,
            instructions,
            maxTokens: 16384
        });

        return {
            type: 'final_response',
            finished: true,
            needsUserInput: true,
            response
        };
    }
}
