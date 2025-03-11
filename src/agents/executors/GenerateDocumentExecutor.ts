import { PromptBuilder } from 'src/llm/promptBuilder';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { JSONSchema } from 'openai/lib/jsonschema';
import { ArtifactType, DocumentSubtype } from 'src/tools/artifact';
import { ExecuteParams } from '../interfaces/ExecuteParams';

@StepExecutorDecorator(ExecutorType.GENERATE_DOCUMENT, 'Create/revise Markdown a single document.')
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

    getArtifactType(): string {
        return ArtifactType.Document;
    }

    getArtifactType(codeBlockType: string): ArtifactType {
        if (codeBlockType === "markdown") {
            return ArtifactType.Document;
        } else {
            return ArtifactType.Unknown;
        }
    }

    protected async createBasePrompt(params: ExecuteParams): Promise<PromptBuilder> {
        const prompt = await super.createBasePrompt(params);
        const subtypesContent = await this.getSupportedSubtypesContent(this.getArtifactType());

        if (subtypesContent) {
            prompt.addInstruction(`SUPPORTED DOCUMENT SUBTYPES:\n${subtypesContent}`);
            prompt.addInstruction(`When creating a document, specify the most appropriate subtype in your response.`);
        }

        return prompt;
    }
}
