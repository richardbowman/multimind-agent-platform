import { ArtifactType } from 'src/tools/artifact';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ArtifactGenerationStepResponse, GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { PromptBuilder } from 'src/llm/promptBuilder';
import { ModelConversation } from '../interfaces/StepExecutor';

@StepExecutorDecorator(ExecutorType.GENERATE_DIAGRAM, 'Create/revise diagrams such as mindmaps, flowcharts, gantt, quadrant diagrams (using Mermaid)')
export class GenerateDiagramExecutor extends GenerateArtifactExecutor {
    protected addContentFormattingRules(prompt: ModelConversation<ArtifactGenerationStepResponse>) {
        prompt.addInstruction(`DIAGRAM FORMATTING RULES:
- Use Mermaid diagram syntax only
- Start with the diagram type declaration (e.g., flowchart, sequenceDiagram, etc.)
- Use proper indentation and structure
- Include clear node labels and connections`);
    }

    protected getSupportedFormat(): string {
        return 'mermaid';
    }

    getArtifactType(): ArtifactType {
        return ArtifactType.Diagram;
    }
}
