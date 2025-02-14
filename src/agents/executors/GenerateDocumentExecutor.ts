import { PromptBuilder } from 'src/llm/promptBuilder';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { JSONSchema } from 'openai/lib/jsonschema';
import { ArtifactType } from 'src/tools/artifact';

@StepExecutorDecorator(ExecutorType.GENERATE_DOCUMENT, 'Create/revise Markdown documents')
export class GenerateDocumentExecutor extends GenerateArtifactExecutor {
    protected addContentFormattingRules(prompt: PromptBuilder) {
        prompt.addInstruction(`DOCUMENT FORMATTING RULES:
- Use standard Markdown syntax
- Include proper headings and structure
- Use lists, tables, and other formatting as needed
- Ensure proper spacing between elements`);
    }

    protected getSupportedFormats(): string[] {
        return ['markdown'];
    }

    getArtifactType(codeBlockType: string): ArtifactType {
        if (codeBlockType === "markdown") {
            return ArtifactType.Document;
        } else {
            return ArtifactType.Unknown;
        }
    }
}
