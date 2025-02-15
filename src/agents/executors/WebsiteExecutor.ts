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
import { ModelType } from 'src/llm/LLMServiceFactory';

@StepExecutorDecorator(ExecutorType.GENERATE_WEBSITE, 'Create/revise code for React-based website/app')
export class WebsiteExecutor extends GenerateArtifactExecutor {
    constructor(params: ExecutorConstructorParams) {
        super(params);
    }

    protected createBasePrompt(params: ExecuteParams): PromptBuilder {
        const prompt = super.createBasePrompt(params);
        
        // Add website-specific instructions
        prompt.addInstruction("You are creating a website. Follow these guidelines:");
        prompt.addInstruction("- Use modern, responsive design principles");
        prompt.addInstruction("- You may use React 19 and Material-UI (MUI) components");
        prompt.addInstruction("- Available MUI themes (use createTheme() to customize):");
        prompt.addInstruction("  - light: Default light theme");
        prompt.addInstruction("  - dark: Default dark theme");
        prompt.addInstruction("  - blue: Blue color scheme");
        prompt.addInstruction("  - green: Green color scheme");
        prompt.addInstruction("  - corporate: Professional business theme");
        prompt.addInstruction("- To use a theme:");
        prompt.addInstruction("  const theme = WebsiteLibs.getTheme('themeName');");
        prompt.addInstruction("  const themeProvider = WebsiteLibs.ThemeProvider;");
        prompt.addInstruction("  Wrap your app in: <themeProvider theme={theme}>");
        prompt.addInstruction("- Use these exact script references in your HTML:");
        prompt.addInstruction("  <script src='../website-libs/website-libs.min.js'></script>");
        prompt.addInstruction("- To access needed libraries: const { React, ReactDOM, ReactDOMClient, MaterialUI } = WebsiteLibs;");
        prompt.addInstruction("- Write plain JavaScript code - no need for Babel script tags as JSX is precompiled");
        prompt.addInstruction("  The generated code must properly initialize React and MUI components");
        prompt.addInstruction("  - Use ReactDOMClient.createRoot to mount your root component");
        prompt.addInstruction("  - Ensure all MUI component imports are properly destructured from MaterialUI variable");
        prompt.addInstruction("- Do not use any other CDN-hosted libraries");
        prompt.addInstruction("- Include all necessary JavaScript code within the HTML file");
        
        return prompt;
    }

    protected addContentFormattingRules(prompt: PromptBuilder) {
        prompt.addInstruction("Format the website using these rules:");
        prompt.addInstruction("- Use HTML5 doctype declaration");
        prompt.addInstruction("- Include comments for major sections");
        prompt.addInstruction("- Use React functional components with proper JSX syntax");
        prompt.addInstruction("  - Each component must return a single root element (use React.Fragment or a div)");
        prompt.addInstruction("- Use MUI components with proper import syntax");
        prompt.addInstruction("- Ensure all React components are properly mounted");
        prompt.addInstruction("- Write React components using standard JavaScript syntax");
        prompt.addInstruction("- Always wrap multiple sibling components in a single root element");
        prompt.addInstruction("- When using React.createElement():");
        prompt.addInstruction("  - First argument is the component or HTML tag name (string)");
        prompt.addInstruction("  - Second argument is props object (can be null if no props)");
        prompt.addInstruction("  - Remaining arguments are children components");
        prompt.addInstruction("  - Example: React.createElement('div', {className: 'container'}, child1, child2)");
        prompt.addInstruction("- Ensure all component names are properly referenced as strings or variables");
    }

    getSupportedFormats(): string[] {
        return ['html', 'jsx'];
    }


    async execute(params: ExecuteParams): Promise<StepResult<ArtifactGenerationStepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.ArtifactGenerationResponse);
        const result = await super.execute({
            ...params,
            modelType: ModelType.ADVANCED_REASONING
        });
        
        return result;
    }

    getArtifactType(codeBlockType: string): ArtifactType {
        return ArtifactType.Webpage;
    }
}
