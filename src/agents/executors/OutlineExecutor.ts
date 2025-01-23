import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResult } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ContentOutline } from 'src/schemas/outline';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StructuredInputPrompt } from 'src/prompts/structuredInputPrompt';
import { OutlineApprovalCheck } from 'src/schemas/OutlineApprovalCheck';

/**
 * Executor that creates structured content outlines for documents.
 * Key capabilities:
 * - Generates hierarchical document outlines
 * - Creates logical section breakdowns
 * - Provides section descriptions and key points
 * - Incorporates research findings into outline structure
 * - Suggests content development strategies
 * - Maintains consistent document organization
 * - Supports both new outlines and revisions
 * - Integrates with content generation workflow
 */
@StepExecutorDecorator(ExecutorType.OUTLINE, 'Create structured content outlines')
export class OutlineExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.ContentOutline);

        // Check if we have a previous outline result
        const previousOutline = params. previousResult?.find?.(
            (result) => result.type === 'draft-outline'
        );

        // If we have a message and a previous outline, treat it as feedback
        if (params.message && previousOutline) {
            const feedback = params.message;
            
            // Analyze if the feedback indicates approval using structured output
            const approvalSchema = await getGeneratedSchema(SchemaType.OutlineApprovalCheck);
            const approvalCheck = await this.modelHelpers.generate<OutlineApprovalCheck>({
                message: `Does this feedback indicate the outline is approved? Feedback: ${feedback}`,
                instructions: new StructuredOutputPrompt(
                    approvalSchema,
                    `Analyze the feedback and determine if it indicates approval of the outline.
If the feedback contains words like "approved", "looks good", "proceed", or similar positive confirmation, return approved: true.
If the feedback contains requests for changes, return approved: false and list the requested changes.
Also provide a confidence score (0-100) in your assessment and a brief summary of the feedback.`
                )
            });

            if (approvalCheck.approved) {
                return {
                    type: "outline",
                    finished: true,
                    response: {
                        message: "Outline approved! Proceeding to next steps.",
                        type: "final-outline",
                        data: previousOutline.data
                    }
                };
            } else {
                // Revise outline based on feedback
                const revisedOutline = await this.modelHelpers.generate<ContentOutline>({
                    message: `Original outline: ${JSON.stringify(previousOutline.data)}\n\nFeedback: ${feedback}`,
                    instructions: new StructuredOutputPrompt(schema, `Revise the outline based on the provided feedback.`)
                });

                return {
                    type: "outline",
                    finished: false,
                    needsUserInput: true,
                    response: {
                        message: `**Revised Content Outline**\n\n# ${revisedOutline.title}\n\n${revisedOutline.sections.map(s => 
                            `## ${s.heading}\n${s.description}\n\nKey Points:\n${s.keyPoints.map(p => `- ${p}`).join('\n')}`
                        ).join('\n\n')}\n\n**Strategy:**\n${revisedOutline.strategy}\n\nPlease review this revised outline and provide feedback or approval to proceed.`,
                        type: "draft-outline",
                        data: revisedOutline
                    }
                };
            }
        }

        // First pass - create initial outline
        const prompt = `You are a content outline specialist.
Given a content goal and research findings, create a well-structured outline.
Break the content into logical sections with clear descriptions and key points.

${params.previousResult ? `Use these research findings to inform the outline:\n${JSON.stringify(params.previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate<ContentOutline>({
            message: params.stepGoal || params.message,
            instructions
        });

        return {
            type: "outline",
            finished: params.executionMode === "conversation" ? false : true,
            needsUserInput: params.executionMode === "conversation" ? true : false,
            response: {
                message: `**Draft Content Outline**\n\n# ${result.title}\n\n${result.sections.map(s => 
                    `## ${s.heading}\n${s.description}\n\nKey Points:\n${s.keyPoints.map(p => `- ${p}`).join('\n')}`
                ).join('\n\n')}\n\n**Strategy:**\n${result.strategy}\n\nPlease review this outline and provide feedback or approval to proceed.`,
                type: "draft-outline",
                data: result
            }
        };
    }
}
