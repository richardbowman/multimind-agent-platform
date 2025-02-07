import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ArtifactManager } from 'src/tools/artifactManager';
import Logger from '../../helpers/logger';
import { ExecutorType } from '../interfaces/ExecutorType';
import { GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { ArtifactGenerationResponse } from 'src/schemas/ArtifactGenerationResponse';
import { StepResponseType } from '../interfaces/StepResult';

@StepExecutorDecorator(ExecutorType.GENERATE_DIAGRAM, 'Create/revise Mermaid diagrams')
export class GenerateDiagramExecutor extends GenerateArtifactExecutor {
    protected getContentFormattingRules(): string {
        return `DIAGRAM FORMATTING RULES:
- Use Mermaid diagram syntax only
- Start with the diagram type declaration (e.g., flowchart, sequenceDiagram, etc.)
- Use proper indentation and structure
- Include clear node labels and connections`;
    }

    protected async getOutputInstructions(schema: any): Promise<string> {
        const baseInstructions = await super.getOutputInstructions(schema);
        return `${baseInstructions}

3. Provide the diagram in a separately enclosed \`\`\`mermaid code block`;
    }

    protected getSupportedFormats(): string[] {
        return ['mermaid'];
    }
}
