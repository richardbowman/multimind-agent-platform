import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResponse, StepResponseType, StepResult, StepResultType } from '../interfaces/StepResult';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { FinalResponse } from '../../schemas/finalResponse';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ExecutorType } from '../interfaces/ExecutorType';
import { StringUtils } from 'src/utils/StringUtils';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ModelType } from 'src/llm/LLMServiceFactory';
import { ContentType } from 'src/llm/promptBuilder';
import { ScrapeResult, ScrapeStepResponse } from './WebScrapeExecutor';
import { ModelMessageResponse } from 'src/schemas/ModelResponse';

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
export class FinalResponseExecutor implements StepExecutor<StepResponse> {
    modelHelpers: ModelHelpers;
    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.FinalResponse);

        const instructions = `You are an AI assistant generating a final response.
Synthesize all the intermediate results into a clear, comprehensive answer that addresses the original goal.
Include relevant details from all steps while maintaining clarity and coherence. Include your sources.

    Overall goal: ${params.overallGoal} 
    Step goal: ${params.stepGoal}`;

        const promptBuilder = this.modelHelpers.createPrompt();
        promptBuilder.registerStepResultRenderer<ScrapeStepResponse>(StepResponseType.WebPage, (response: ScrapeStepResponse) => {
            const validSummaries = response.data.summaries?.filter(s => s.date && s.summary);
            return validSummaries?.map((s, i) => `{$i+1} of ${response.data.summaries.length}: Date: ${s.date}\nSummary: \`\`\`\n${s.summary}\n\`\`\`\n`).join('\n') + "\n";
        });

        promptBuilder.addInstruction(instructions);
        promptBuilder.addContext({ contentType: ContentType.ABOUT });
        promptBuilder.addContext({ contentType: ContentType.GOALS_FULL, params });

        params.context?.artifacts && promptBuilder.addContext({ contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts });
        params.previousResponses && promptBuilder.addContext({ contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses });

        // Add output instructions for multiple content types
        promptBuilder.addInstruction(`OUTPUT INSTRUCTIONS:
1. Explain to the user what you found and how you synthesized the information.

2. In order to share the results, you will use two code blocks.
3. Use one enclosed code block with the hidden indicator \`\`\`json[hidden] that matches this JSON Schema:
${JSON.stringify(schema, null, 2)}
for the response attributes.`);

        promptBuilder.addInstruction(`4. Provide the content in a separately enclosed code block using the appropriate syntax:
- For markdown: \`\`\`markdown
- For csv: \`\`\`csv
- For mermaid: \`\`\`mermaid`);

        promptBuilder.addInstruction(`For CSV format: 
1. Enclose all fields in double quotes ("").
2. Escape double quotes inside fields by doubling them ("Field with ""quotes"" inside").
3. Escape newlines inside of fields with \\n
` );

        const prompt = promptBuilder.build();

        const response = await this.modelHelpers.generate({
            message: params.message || params.stepGoal,
            instructions: prompt,
            model: ModelType.CONVERSATION,
            threadPosts: params.context?.threadPosts
        });

        const json = StringUtils.extractAndParseJsonBlocks(response.message)[0];
        const contentBlocks = StringUtils.extractCodeBlocks(response.message).filter(b => b.type !== 'json');

        if (contentBlocks.length === 0) {
            throw new Error('No content blocks found in the response.');
        }

        const finalContent = contentBlocks[0].code;
        const contentType = contentBlocks[0].type;

        const result = {
            ...json,
            content: finalContent,
            contentType: contentType
        } as FinalResponse;

        return {
            type: StepResultType.FinalResponse,
            finished: true,
            response: {
                message: response.message
            }
        };
    }
}
