import { PromptBuilder } from 'src/llm/promptBuilder';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { JSONSchema } from 'openai/lib/jsonschema';
import { ArtifactType, DocumentSubtype } from 'src/tools/artifact';
import { ExecuteParams } from '../interfaces/ExecuteParams';

@StepExecutorDecorator(ExecutorType.GENERATE_DOCUMENT, 'Create/revise Markdown a single document.')
export class GenerateDocumentExecutor extends GenerateArtifactExecutor {
    private supportedSubtypes: DocumentSubtype[] = [];

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

    private async loadSupportedSubtypes(params: ExecuteParams): Promise<void> {
        try {
            // Look for the supported subtypes artifact
            const artifacts = await this.artifactManager.getArtifacts({ type: 'document', subtype: 'Supported Document Artifact Sub-types' });
            if (artifacts.length > 0) {
                const artifact = await this.artifactManager.loadArtifact(artifacts[0].id);
                if (artifact?.content && typeof artifact.content === 'string') {
                    this.supportedSubtypes = JSON.parse(artifact.content) as DocumentSubtype[];
                }
            }
        } catch (error) {
            Logger.error('Error loading supported document subtypes:', error);
        }
    }

    protected async createBasePrompt(params: ExecuteParams): Promise<PromptBuilder> {
        await this.loadSupportedSubtypes(params);
        const prompt = super.createBasePrompt(params);

        if (this.supportedSubtypes.length > 0) {
            prompt.addInstruction(`SUPPORTED DOCUMENT SUBTYPES:\n` +
                this.supportedSubtypes.map((subtype, index) => 
                    `${index + 1}. ${subtype}`
                ).join('\n'));
            prompt.addInstruction(`When creating a document, specify the most appropriate subtype in your response.`);
        }

        return prompt;
    }

    protected async prepareArtifactMetadata(result: any): Promise<Record<string, any>> {
        const metadata = await super.prepareArtifactMetadata(result);
        
        if (result.subtype && this.supportedSubtypes.includes(result.subtype)) {
            metadata.subtype = result.subtype;
        }

        return metadata;
    }
}
