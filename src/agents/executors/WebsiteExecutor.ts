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
import { ModelType } from "src/llm/types/ModelType";
import { ModelConversation } from '../interfaces/StepExecutor';

@StepExecutorDecorator(ExecutorType.GENERATE_WEBSITE, 'Create/revise code for React-based website/app')
export class WebsiteExecutor extends GenerateArtifactExecutor {
    constructor(params: ExecutorConstructorParams) {
        super(params);
    }

    protected async createBasePrompt(params: ExecuteParams): Promise<ModelConversation<ArtifactGenerationStepResponse>> {
        const prompt = await super.createBasePrompt(params);
        
        // Add website-specific instructions
        prompt.addInstruction(
`You are creating a website. Follow these guidelines:
- Use modern, responsive design principles
- You may use React 19 and Material-UI (MUI) components
- Use these exact script references in your HTML.
- Your JavaScript must be inside of a 'text/babel' script so the JSX can be processed.
- To access needed libraries: 
  - Ensure all MUI component imports are properly destructured from MaterialUI variable;

## Code Template

<artifact_html>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Simple Todo List App</title>
  <script src='../website-libs/website-libs.min.js'></script>
  <script type="text/babel">
    // The generated code must properly initialize React and MUI components;
    const { React, ReactDOM, ReactDOMClient, MaterialUI, MaterialIcons, Artifacts, CSV } = WebsiteLibs;
    const { CssBaseline, Container, Container, Button... } = MaterialUI;
    const { Add } = MaterialIcons;
    // use MUI themes
    const theme = WebsiteLibs.getTheme('dark');
    const ThemeProvider = WebsiteLibs.ThemeProvider;

    const App = () => {
        ...
        return (
            <ThemeProvider theme={theme}>
            <CssBaseline/>
            ...your app components...
            </ThemeProvider>
        );
    };

    // Use ReactDOMClient.createRoot to mount your root component:
    const root = ReactDOMClient.createRoot(document.getElementById('root'));
    root.render(<App />);
  </script>
</head>
<body>
  <div id="root"></div>
</div>
</artifact_html>

## CSV 

CSV parsing utilities are available:
- CSV.parseSync(content : string) : Record<string, string>[]
- CSV.stringifySync(Record<string, string>[]) : string

## Themes

- Available MUI themes (use createTheme() to customize):
    - light: Default light theme
    - dark: Default dark theme
    - blue: Blue color scheme
    - green: Green color scheme
    - corporate: Professional business theme

- Include all necessary JavaScript code within the HTML file

## Artifacts

You can load additional artifacts using these methods:
- Artifacts.loadArtifactContent(artifactId : string): string: Loads an artifact by ID
- Artifacts.getArtifactMetadata(artifactId : string) : Record<string, any>: Gets metadata for an artifact
- Artifacts.listAvailableArtifacts() : { title: string, id: string, type: string, subtype: string }: Lists all artifacts available to this project

Example usage:
// Load an artifact
const artifact = await Artifacts.loadArtifactContent('12345');
console.log(artifact.content);

// Get artifact metadata
const metadata = await Artifacts.getArtifactMetadata('12345');
console.log(metadata.title);

// List available artifacts
const artifacts = await Artifacts.listAvailableArtifacts();
console.log(artifacts);`);
        
        return prompt;
    }

    protected getInstructionByOperation(operation: OperationTypes | 'requestFullContent'): string {
        if (operation === 'replace') {
            return 'Replace operations are disabled for websites. Please use patch operations instead.';
        }
        return super.getInstructionByOperation(operation);
    }

    protected addContentFormattingRules(prompt: ModelConversation<ArtifactGenerationStepResponse>) {
    }

    getSupportedFormat(): string {
        return 'html';
    }


    async execute(params: ExecuteParams): Promise<StepResult<ArtifactGenerationStepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.ArtifactGenerationResponse);
        const result = await super.execute(params, ModelType.CODING);
        return result;
    }

    getArtifactType(codeBlockType: string): ArtifactType {
        return ArtifactType.Webpage;
    }

    requestFullContext() {
        return true;
    }
}
