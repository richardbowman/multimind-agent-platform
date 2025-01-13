import { ExecutorConstructorParams, StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ContentOutline } from 'src/schemas/outline';
import { ExecutorType } from './ExecutorType';

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
        this.modelHelpers = new ModelHelpers(params.llmService, 'executor');
    }

    async executeOld(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.ContentOutline);

        const prompt = `You are a content outline specialist.
Given a content goal and research findings, create a well-structured outline.
Break the content into logical sections with clear descriptions and key points.

${previousResult ? `Use these research findings to inform the outline:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate<ContentOutline>({
            message: goal,
            instructions
        });

        return {
            type: "outline",
            finished: true,
            response: {
                message: `**Content Outline**\n\n# ${result.title}\n\n${result.sections.map(s => 
                    `## ${s.heading}\n${s.description}\n\nKey Points:\n${s.keyPoints.map(p => `- ${p}`).join('\n')}`
                ).join('\n\n')}\n\n**Strategy:**\n${result.strategy}`,
                data: result
            }
        };
    }
}
