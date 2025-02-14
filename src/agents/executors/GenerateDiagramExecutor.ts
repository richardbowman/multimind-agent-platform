import { ArtifactType } from 'src/tools/artifact';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { PromptBuilder } from 'src/llm/promptBuilder';

@StepExecutorDecorator(ExecutorType.GENERATE_DIAGRAM, 'Create/revise diagrams such as mindmaps, flowcharts, gantt, quadrant diagrams (and others supported by Mermaid.js)')
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

    getArtifactType(codeBlockType: string): ArtifactType {
        if (codeBlockType === "mermaid") {
            return ArtifactType.Diagram;
        } else {
            return ArtifactType.Unknown;
        }
    }
}
