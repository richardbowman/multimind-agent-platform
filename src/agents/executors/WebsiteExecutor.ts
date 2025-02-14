import { GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ArtifactType } from 'src/tools/artifact';
import { PromptBuilder, ContentType } from 'src/llm/promptBuilder';
import { WebsiteGenerationResponse } from 'src/schemas/WebsiteGenerationResponse';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';

export class WebsiteExecutor extends GenerateArtifactExecutor {
    constructor(params: ExecutorConstructorParams) {
        super(params);
    }

    protected createBasePrompt(params: ExecuteParams): PromptBuilder {
        const prompt = super.createBasePrompt(params);
        
        // Add website-specific instructions
        prompt.addInstruction("You are creating a website. Follow these guidelines:");
        prompt.addInstruction("- Use modern, responsive design principles");
        prompt.addInstruction("- Include semantic HTML5 structure");
        prompt.addInstruction("- Use CSS for styling (prefer Tailwind CSS classes)");
        prompt.addInstruction("- Include JavaScript for interactivity if needed");
        prompt.addInstruction("- Ensure accessibility standards are met");
        prompt.addInstruction("- Include meta tags for SEO optimization");
        
        // Add website context
        prompt.addContext({contentType: ContentType.ABOUT, params});
        prompt.addContext({contentType: ContentType.GOALS_FULL, params});
        
        return prompt;
    }

    protected addContentFormattingRules(prompt: PromptBuilder) {
        prompt.addInstruction("Format the website using these rules:");
        prompt.addInstruction("- Use HTML5 doctype declaration");
        prompt.addInstruction("- Include viewport meta tag for responsiveness");
        prompt.addInstruction("- Use semantic tags (header, main, section, article, footer)");
        prompt.addInstruction("- Include proper ARIA attributes for accessibility");
        prompt.addInstruction("- Use Tailwind CSS classes for styling");
        prompt.addInstruction("- Include comments for major sections");
    }

    getSupportedFormats(): string[] {
        return ['html', 'css', 'js'];
    }

    async execute(params: ExecuteParams): Promise<StepResult<ArtifactGenerationStepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.WebsiteGenerationResponse);
        const result = await super.execute(params);
        
        // Add website-specific post-processing
        if (result.response?.type === StepResponseType.GeneratedArtifact) {
            result.response.message = "Website created successfully! You can now view and edit it.";
        }
        
        return result;
    }

    getArtifactType(codeBlockType: string): ArtifactType {
        return ArtifactType.Webpage;
    }
}
