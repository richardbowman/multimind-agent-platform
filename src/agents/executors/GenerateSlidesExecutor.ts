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
        promptBuilder.addInstruction(`
            Follow these formatting rules for each slide:
            1. Each slide must start with a level 2 heading (##) for the title
            2. Slide content should be in markdown format
            3. Use bullet points for lists
            4. Use code blocks for code examples
            5. Use level 3 headings (###) for subsections
            6. Separate slides with a blank line
            7. Keep each slide focused on one main idea
            8. Use simple, clear language
            9. Include relevant examples where appropriate
        `);
        promptBuilder.addInstruction(`
            Example slide format:
            ## Slide Title
            - Main point 1
            - Main point 2
            ### Subsection
            - Supporting detail
            \`\`\`python
            # Code example
            def example():
                print("Hello World")
            \`\`\`
        `);
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
        const markdownSections = StringUtils.extractMarkdownSections(rawResponse.message);
        const slides = markdownSections.map((content, index) => {
            const lines = content.split('\n');
            const title = lines[0].replace(/^#+\s*/, '').trim();
            const slideContent = lines.slice(1).join('\n').trim();
            
            return {
                title,
                content: slideContent,
                notes: '',
                transition: index === 0 ? 'slide' : 'fade',
                layout: 'default',
                autoAnimate: true
            };
        });

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
