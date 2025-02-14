import { ArtifactGenerationStepResponse, GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ArtifactType } from 'src/tools/artifact';
import { PromptBuilder, ContentType } from 'src/llm/promptBuilder';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepResponseType, StepResult } from '../interfaces/StepResult';
import { ExecutorType } from '../interfaces/ExecutorType';
import { StepExecutorDecorator } from '../decorators/executorDecorator';

@StepExecutorDecorator(ExecutorType.GENERATE_WEBSITE, 'Create/revise a website')
export class WebsiteExecutor extends GenerateArtifactExecutor {
    constructor(params: ExecutorConstructorParams) {
        super(params);
    }

    protected createBasePrompt(params: ExecuteParams): PromptBuilder {
        const prompt = super.createBasePrompt(params);
        
        // Add website-specific instructions
        prompt.addInstruction("You are creating a website. Follow these guidelines:");
        prompt.addInstruction("- Use modern, responsive design principles");
        prompt.addInstruction("- Include JavaScript for interactivity if needed");
        prompt.addInstruction("- You may not run terminal commmands, use CDN-hosted libraries, you must create the complete app in an HTML file.");
        
        return prompt;
    }

    protected addContentFormattingRules(prompt: PromptBuilder) {
        prompt.addInstruction("Format the website using these rules:");
        prompt.addInstruction("- Use HTML5 doctype declaration");
        prompt.addInstruction("- Include comments for major sections");
    }

    getSupportedFormats(): string[] {
        return ['html'];
    }

    async execute(params: ExecuteParams): Promise<StepResult<ArtifactGenerationStepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.ArtifactGenerationResponse);
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
