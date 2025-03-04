import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResponse, StepResponseType, StepResult } from '../interfaces/StepResult';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { BrainstormIdea, BrainstormResponse, SlideContent } from 'src/schemas/BrainstormResponse';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { StructuredOutputPrompt } from 'src/llm/ILLMService';
import { ArtifactType } from 'src/tools/artifact';
import { StringUtils } from 'src/utils/StringUtils';

export interface BrainstormStepResponse extends StepResponse {
    type: StepResponseType.Brainstorm,
    data: {
        topic?: string,
        ideas?: BrainstormIdea
    }
}

export interface SlideContent {
    title?: string;
    content: string | string[]; // Can be single content or array for fragments
    notes?: string;
    transition?: string;
    background?: string;
    verticalSlides?: SlideContent[]; // For vertical slides
    layout?: 'default' | 'title' | 'section' | 'quote' | 'image' | 'code';
    fragments?: boolean; // Whether to use fragments for array content
    autoAnimate?: boolean;
    theme?: 'default' | 'black' | 'white' | 'league' | 'beige' | 'sky' | 'night' | 'serif' | 'simple' | 'solarized' | 'blood' | 'moon' | 'dracula';
}

export interface BrainstormIdea {
    title: string;
    content: string | string[];
    notes?: string;
    layout?: string;
    fragments?: boolean;
    verticalSlides?: BrainstormIdea[];
}

export interface BrainstormResponse {
    topic: string;
    ideas: BrainstormIdea[];
    isComplete: boolean;
    presentationTheme?: string;
}

@StepExecutorDecorator(ExecutorType.GENERATE_SLIDES, 'Generate a slide deck', true)
export class GenerateSlidesExecutor implements StepExecutor<BrainstormStepResponse> {
    protected generateSlideContent(ideas: BrainstormIdea[]): SlideContent[] {
        return ideas.map((idea, index) => ({
            title: idea.title,
            content: idea.content,
            notes: idea.notes,
            transition: index === 0 ? 'slide' : 'fade',
            layout: idea.layout || 'default',
            fragments: idea.fragments,
            verticalSlides: idea.verticalSlides?.map(vSlide => ({
                ...vSlide,
                transition: 'fade'
            })),
            autoAnimate: true
        }));
    }

    protected generatePresentationData(slides: SlideContent[]): any {
        return {
            title: "Brainstorming Presentation",
            theme: "dracula",
            slides: slides.map(slide => ({
                title: slide.title,
                content: Array.isArray(slide.content) ? 
                    slide.content.map((c, i) => 
                        slide.fragments ? `<p class="fragment" data-fragment-index="${i}">${c}</p>` : c
                    ).join('\n') : 
                    slide.content,
                notes: slide.notes,
                transition: slide.transition,
                background: slide.background,
                layout: slide.layout,
                autoAnimate: slide.autoAnimate,
                verticalSlides: slide.verticalSlides?.map(vSlide => ({
                    ...vSlide,
                    content: Array.isArray(vSlide.content) ? 
                        vSlide.content.map((c, i) => 
                            vSlide.fragments ? `<p class="fragment" data-fragment-index="${i}">${c}</p>` : c
                        ).join('\n') : 
                        vSlide.content
                }))
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

    async execute(params: ExecuteParams): Promise<StepResult<BrainstormStepResponse>> {
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

        const schema = await getGeneratedSchema(SchemaType.BrainstormResponse);
        promptBuilder.addOutputInstructions(OutputType.JSON_WITH_MESSAGE, schema);
        
        const rawResponse = await this.modelHelpers.generate({
            message: params.message || params.stepGoal,
            instructions: promptBuilder
        });
        const response = StringUtils.extractAndParseJsonBlock<BrainstormResponse>(rawResponse.message, schema);
        const message = StringUtils.extractNonCodeContent(rawResponse.message);

        // Parse and format the response
        const ideas = response?.ideas || [];

        // Generate slides
        const slides = this.generateSlideContent(ideas);
        const presentationData = this.generatePresentationData(slides);

        return {
            type: "brainstorm",
            finished: response?.isComplete || false,
            needsUserInput: !response?.isComplete,
            response: {
                type: StepResponseType.Brainstorm,
                message,
                data: {
                    topic: response?.topic,
                    ideas: response?.ideas
                },
                isComplete: response?.isComplete || false
            },
            artifacts: [{
                type: ArtifactType.Presentation,
                content: Buffer.from(JSON.stringify(presentationData)),
                metadata: {
                    title: response?.topic,
                    format: 'revealjs-json',
                    slideCount: slides.length,
                    generatedAt: new Date().toISOString()
                }
            }]
        };
    }
}
