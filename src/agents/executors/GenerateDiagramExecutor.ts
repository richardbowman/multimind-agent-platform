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
import { JSONSchema } from 'src/llm/ILLMService';
import { PromptBuilder } from 'src/llm/promptBuilder';

@StepExecutorDecorator(ExecutorType.GENERATE_DIAGRAM, 'Create/revise Mermaid diagrams')
export class GenerateDiagramExecutor extends GenerateArtifactExecutor {
    protected addContentFormattingRules(prompt: PromptBuilder) {
        prompt.addInstruction(`DIAGRAM FORMATTING RULES:
- Use Mermaid diagram syntax only
- Start with the diagram type declaration (e.g., flowchart, sequenceDiagram, etc.)
- Use proper indentation and structure
- Include clear node labels and connections`);
    }

    protected getSupportedFormats(): string[] {
        return ['mermaid'];
    }
}
