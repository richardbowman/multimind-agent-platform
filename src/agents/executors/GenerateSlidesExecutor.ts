import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResponse, StepResponseType, StepResult } from '../interfaces/StepResult';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { ArtifactType } from 'src/tools/artifact';
import { StringUtils } from 'src/utils/StringUtils';

export interface SlideContent {
    title?: string;
    content: string; // Markdown content
    notes?: string;
    transition?: string;
    background?: string;
    layout?: 'default' | 'title' | 'section' | 'quote' | 'image' | 'code';
    autoAnimate?: boolean;
    theme?: 'default' | 'black' | 'white' | 'league' | 'beige' | 'sky' | 'night' | 'serif' | 'simple' | 'solarized' | 'blood' | 'moon' | 'dracula';
}

export interface SlideResponse {
    slides: SlideContent[];
    presentationTheme?: string;
}

@StepExecutorDecorator(ExecutorType.GENERATE_SLIDES, 'Generate a slide deck', true)
export class GenerateSlidesExecutor implements StepExecutor<StepResponse> {
    protected generateSlideContent(slides: SlideContent[]): SlideContent[] {
        return slides.map((slide, index) => ({
            title: slide.title,
            content: slide.content,
            notes: slide.notes,
            transition: index === 0 ? 'slide' : 'fade',
            layout: slide.layout || 'default',
            autoAnimate: true
        }));
    }

    protected generatePresentationData(slides: SlideContent[]): any {
        return {
            title: "Brainstorming Presentation",
            theme: "dracula",
            slides: slides.map(slide => ({
                title: slide.title,
                content: slide.content,
                notes: slide.notes,
                transition: slide.transition,
                background: slide.background,
                layout: slide.layout,
                autoAnimate: slide.autoAnimate
            }))
        };
    }
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.modelHelpers.createPrompt().registerStepResultRenderer(StepResponseType.Brainstorm, (response: StepResponse) => {
            const ideas = response?.data?.ideas || [];
            const formattedIdeas = ideas.map((idea: any) => 
                `### ${idea.title}\n${idea.description}\n\n**Benefits:**\n${idea.benefits}`
            ).join('\n\n');
            return `PAST IDEAS FOR TOPIC: ${response.data?.topic}:\n${formattedIdeas}`;
        })
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const promptBuilder = this.modelHelpers.createPrompt();
        
        // Add core instructions
        promptBuilder.addInstruction("You are a presentation creation assistant.");
        promptBuilder.addInstruction("Generate a slide deck based on the provided content.");
        promptBuilder.addInstruction("Each slide should have a clear title and markdown content.");
        promptBuilder.addInstruction("Use appropriate slide layouts and transitions.");

        // Add context from previous steps if available
        if (params.previousResponses) {
            promptBuilder.addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses||[]});
        }

        // Add artifacts if available
        if (params.context?.artifacts) {
            promptBuilder.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts||[]});
        }

        // Add execution parameters
        promptBuilder.addContext({contentType: ContentType.EXECUTE_PARAMS, params});

        // Generate the slides
        const rawResponse = await this.modelHelpers.generate({
            message: params.message || params.stepGoal,
            instructions: promptBuilder
        });
        
        // Extract the slide content from the response
        const slides = StringUtils.extractMarkdownSections(rawResponse.message).map(content => ({
            title: content.split('\n')[0].replace('#', '').trim(),
            content,
            notes: '',
            transition: 'fade',
            layout: 'default',
            autoAnimate: true
        }));

        // Generate presentation data
        const presentationData = this.generatePresentationData(slides);

        return {
            type: "slides",
            finished: true,
            needsUserInput: false,
            response: {
                type: StepResponseType.GeneratedArtifact,
                message: "Slide deck generated successfully",
                data: {
                    slides
                }
            },
            artifacts: [{
                type: ArtifactType.Presentation,
                content: Buffer.from(JSON.stringify(presentationData)),
                metadata: {
                    title: "Generated Presentation",
                    format: 'revealjs-json',
                    slideCount: slides.length,
                    generatedAt: new Date().toISOString()
                }
            }]
        };
    }
}
