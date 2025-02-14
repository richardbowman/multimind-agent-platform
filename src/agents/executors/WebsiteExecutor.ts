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
        prompt.addInstruction("- You may use React and Material-UI (MUI) components");
        prompt.addInstruction("- Use these exact script references in your HTML:");
        prompt.addInstruction("  <script src='/react/react.min.js'></script>");
        prompt.addInstruction("  <script src='/react-dom/react-dom.min.js'></script>");
        prompt.addInstruction("  <script src='/mui/material-ui.min.js'></script>");
        prompt.addInstruction("- Do not use any other CDN-hosted libraries");
        prompt.addInstruction("- Include all necessary JavaScript code within the HTML file");
        
        return prompt;
    }

    protected addContentFormattingRules(prompt: PromptBuilder) {
        prompt.addInstruction("Format the website using these rules:");
        prompt.addInstruction("- Use HTML5 doctype declaration");
        prompt.addInstruction("- Include comments for major sections");
        prompt.addInstruction("- Use React functional components with proper JSX syntax");
        prompt.addInstruction("- Use MUI components with proper import syntax");
        prompt.addInstruction("- Ensure all React components are properly mounted");
    }

    getSupportedFormats(): string[] {
        return ['html', 'jsx'];
    }

    protected validateGeneratedCode(code: string): boolean {
        // Check for proper React/MUI references
        const hasReact = code.includes('/react/react.min.js');
        const hasReactDOM = code.includes('/react-dom/react-dom.min.js');
        const hasMUI = code.includes('/mui/material-ui.min.js');
        
        if (!hasReact || !hasReactDOM || !hasMUI) {
            throw new Error('Generated code must use the provided React and MUI library paths');
        }
        
        return true;
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
