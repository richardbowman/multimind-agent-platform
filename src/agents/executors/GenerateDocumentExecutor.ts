import { PromptBuilder } from 'src/llm/promptBuilder';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { JSONSchema } from 'openai/lib/jsonschema';
import { ArtifactType, DocumentSubtype } from 'src/tools/artifact';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ModelConversation } from '../interfaces/StepExecutor';

@StepExecutorDecorator(ExecutorType.GENERATE_DOCUMENT, 'Create/revise Markdown a single document.')
export class GenerateDocumentExecutor extends GenerateArtifactExecutor {
    protected addContentFormattingRules(prompt: ModelConversation) {
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
        return ArtifactType.Document;
    }
}
