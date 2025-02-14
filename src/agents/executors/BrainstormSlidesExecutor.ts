import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ContentType } from 'src/llm/promptBuilder';
import { BrainstormResponse, SlideContent } from 'src/schemas/BrainstormResponse';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { StructuredOutputPrompt } from 'src/llm/ILLMService';
import { ArtifactType } from 'src/tools/artifact';
import { GenerateSlidesExecutor } from './GenerateSlidesExecutor';

@StepExecutorDecorator(ExecutorType.BRAINSTORM_SLIDES, 'Generate creative ideas and create Reveal.js slides', true)
export class BrainstormSlidesExecutor extends GenerateSlidesExecutor {
    constructor(params: ExecutorConstructorParams) {
        super(params);
    }

    protected generateSlideContent(ideas: any[]): SlideContent[] {
        return ideas.map((idea, index) => ({
            title: idea.title,
            content: [
                `## ${idea.title}`,
                `### Problem Statement`,
                idea.problem || 'To be defined',
                `### Solution Overview`,
                idea.description,
                `### Key Benefits`,
                idea.benefits,
                `### Next Steps`,
                idea.nextSteps || 'To be defined'
            ].join('\n'),
            notes: `Additional details for ${idea.title}`,
            transition: index === 0 ? 'slide' : 'fade',
            background: index % 2 === 0 ? '#ffffff' : '#f5f5f5'
        }));
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const result = await super.execute(params);
        
        // Add additional slide-specific instructions
        if (result.artifacts && result.artifacts.length > 0) {
            result.response.message += `\n\n**Presentation generated:** You can view the slides in the artifacts section.`;
        }

        return result;
    }
}
