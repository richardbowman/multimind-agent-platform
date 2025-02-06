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

@StepExecutorDecorator(ExecutorType.BRAINSTORM, 'Generate creative ideas and possibilities through brainstorming', true)
export class BrainstormExecutor implements StepExecutor {
    protected generateSlideContent(ideas: any[]): SlideContent[] {
        return ideas.map((idea, index) => ({
            title: idea.title,
            content: [
                `## ${idea.title}`,
                idea.description,
                `### Benefits:`,
                idea.benefits
            ].join('\n'),
            notes: `Additional details for ${idea.title}`,
            transition: index === 0 ? 'slide' : 'fade',
            background: index % 2 === 0 ? '#ffffff' : '#f5f5f5'
        }));
    }

    protected generateRevealJS(slides: SlideContent[]): string {
        const slideSections = slides.map(slide => `
            <section 
                data-transition="${slide.transition}"
                data-background="${slide.background}"
                data-markdown
            >
                <textarea data-template>
                    ${slide.content}
                </textarea>
                <aside class="notes">
                    ${slide.notes}
                </aside>
            </section>
        `).join('\n');

        return `<!doctype html>
<html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Brainstorming Presentation</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/reveal.min.css">
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/theme/black.css">
    </head>
    <body>
        <div class="reveal">
            <div class="slides">
                ${slideSections}
            </div>
        </div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/reveal.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.5.0/plugin/markdown/markdown.min.js"></script>
        <script>
            Reveal.initialize({
                plugins: [ RevealMarkdown ],
                hash: true,
                postMessage: true,
                postMessageEvents: true,
                transition: 'fade'
            });

            // Send initial slide count
            window.parent.postMessage(JSON.stringify({
                namespace: 'reveal',
                eventName: 'ready',
                state: {
                    totalSlides: Reveal.getTotalSlides()
                }
            }), '*');

            // Listen for slide changes
            Reveal.on('slidechanged', event => {
                window.parent.postMessage(JSON.stringify({
                    namespace: 'reveal',
                    eventName: 'slidechanged',
                    state: {
                        indexh: event.indexh,
                        indexv: event.indexv
                    }
                }), '*');
            });
        </script>
    </body>
</html>`;
    }
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const promptBuilder = this.modelHelpers.createPrompt();
        
        // Add core instructions
        promptBuilder.addInstruction("You are a creative brainstorming assistant.");
        promptBuilder.addInstruction("Generate multiple innovative ideas related to the goal.");
        promptBuilder.addInstruction("For each idea, provide a clear title, description, and potential benefits.");
        promptBuilder.addInstruction("Try not to rule out ideas and focus on being creative.");

        // Add analysis guidelines
        promptBuilder.addInstruction(`After generating ideas, analyze if:
1. We have sufficient diversity of ideas across different approaches
2. We've covered all major aspects of the problem space
3. New ideas are becoming repetitive or less valuable`);

        promptBuilder.addInstruction("Based on this analysis, set isComplete to true if brainstorming should conclude, or false if more ideas are needed. Make sure your message to the user communicates if you want want additional feedback");

        // Add previous results if available
        if (params.previousResponses) {
            promptBuilder.addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses||[]});
        }

        // Add artifacts if available
        if (params.context?.artifacts) {
            promptBuilder.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts||[]});
        }

        // Add execution parameters
        promptBuilder.addContext({contentType: ContentType.EXECUTE_PARAMS, params});

        const prompt = promptBuilder.build();
        
        const schema = await getGeneratedSchema(SchemaType.BrainstormResponse);
        const response = await this.modelHelpers.generate<BrainstormResponse>({
            message: params.message || params.stepGoal,
            instructions: new StructuredOutputPrompt(schema, prompt)
        });

        // Parse and format the response
        const ideas = response.ideas || [];
        const formattedIdeas = ideas.map((idea: any) => 
            `### ${idea.title}\n${idea.description}\n\n**Benefits:**\n${idea.benefits}`
        ).join('\n\n');

        // Generate slides
        const slides = this.generateSlideContent(ideas);
        const revealJS = this.generateRevealJS(slides);

        return {
            type: "brainstorm",
            finished: response.isComplete || false,
            needsUserInput: !response.isComplete,
            response: {
                message: `**Brainstorming Results:**\n\n${formattedIdeas}\n\n**Summary:**\n${response.summary || ''}`,
                isComplete: response.isComplete || false
            },
            artifacts: [{
                id: crypto.randomUUID(),
                type: ArtifactType.PRESENTATION,
                content: Buffer.from(revealJS),
                metadata: {
                    format: 'revealjs',
                    slideCount: slides.length,
                    generatedAt: new Date().toISOString()
                }
            }]
        };
    }
}
