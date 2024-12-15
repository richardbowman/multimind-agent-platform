import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ContentOutline } from 'src/schemas/outline';

@StepExecutorDecorator('outline', 'Create structured content outlines')
export class OutlineExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: ILLMService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
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
