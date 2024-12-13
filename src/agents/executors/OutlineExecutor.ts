import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from '../../llm/lmstudioService';
import LMStudioService from '../../llm/lmstudioService';
import { ModelHelpers } from 'src/llm/helpers';
import { getInlinedSchema } from '../../helpers/schemaUtils';
import { ContentOutline } from '../../schemas/outline';
const schema = getGeneratedSchema('ContentOutline');
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';

@StepExecutorDecorator('outline', 'Create structured content outlines')
export class OutlineExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: LMStudioService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = schema;

        const prompt = `You are a content outline specialist.
Given a content goal and research findings, create a well-structured outline.
Break the content into logical sections with clear descriptions and key points.

${previousResult ? `Use these research findings to inform the outline:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate({
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
