import { ArtifactGenerationStepResponse, GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult, StepResponseType, ReplanType, StepResultType } from '../interfaces/StepResult';
import { ArtifactType } from 'src/tools/artifact';
import { ModelType } from 'src/llm/LLMServiceFactory';
import { StringUtils } from 'src/utils/StringUtils';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { ArtifactGenerationResponse } from 'src/schemas/ArtifactGenerationResponse';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { ModelConversation } from '../interfaces/StepExecutor';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import Logger from 'src/helpers/logger';

export interface CombinedArtifactResponse extends ArtifactGenerationResponse {
    template: string;
    insertionPoints: Record<string, string>;
}

@StepExecutorDecorator(ExecutorType.COMBINE_DOCUMENTS, 'Generate Markdown documents by generating a structure template', true)
export class CombineArtifactsExecutor extends GenerateArtifactExecutor {
    constructor(params: ExecutorConstructorParams) {
        super(params);
    }

    protected getSupportedFormats(): string[] {
        return ["markdown"];
    }

    getArtifactType(): ArtifactType {
        return ArtifactType.Document;
    }

    protected async createBasePrompt(params: ExecuteParams): Promise<ModelConversation> {
        const promptBuilder = this.startModel(params);

        // Add core instructions
        promptBuilder.addInstruction(`Your task is to combine multiple documents into one cohesive document. Follow these steps:
1. Analyze all input documents and identify their key sections
2. Create a template document structure with insertion points
3. Map each input document's content to the appropriate insertion points
4. Generate a final combined document that maintains the best structure and content from all inputs`);

        promptBuilder.addInstruction(`# TEMPLATE INSTRUCTIONS:
- Use <<<INSERT:SOURCE_ID>>> syntax to mark insertion points
- Each insertion point should map to a specific section from an input document
- Maintain logical flow and structure
- Preserve important content from all sources
- Remove redundant or conflicting information`);

        // Add context about all artifacts
        if (params.context?.artifacts) {
            promptBuilder.addContext({
                contentType: ContentType.ARTIFACTS_EXCERPTS,
                artifacts: params.context.artifacts
            });

            // Add full content of each artifact
            for (const artifactRef of params.context.artifacts) {
                const artifact = await this.artifactManager.loadArtifact(artifactRef.id);
                if (artifact) {
                    promptBuilder.addContext(`FULL CONTENT OF ARTIFACT ${artifactRef.id}:\n\`\`\`\n${artifact.content}\n\`\`\``);
                }
            }
        }

        // Add execution parameters
        promptBuilder.addContext({ contentType: ContentType.EXECUTE_PARAMS, params });

        return promptBuilder;
    }

    async execute(params: ExecuteParams, modelType?: ModelType): Promise<StepResult<ArtifactGenerationStepResponse>> {
        const conversation = await this.createBasePrompt(params);
        const schema = await getGeneratedSchema(SchemaType.ArtifactGenerationResponse);

        // Add output instructions
        conversation.addOutputInstructions({
            outputType: OutputType.JSON_AND_MARKDOWN,
            schema,
            specialInstructions: "Provide a template with insertion points and a mapping of which content goes where",
            type: "markdown"
        });

        try {
            const unstructuredResult = await conversation.generate({
                message: params.message || "Create a template for combining these documents",
                modelType: modelType || ModelType.DOCUMENT
            });

            const json = StringUtils.extractAndParseJsonBlock<CombinedArtifactResponse>(unstructuredResult.message, schema);
            const md = StringUtils.extractCodeBlocks(unstructuredResult.message).filter(b => b.type !== 'json');
            const message = StringUtils.extractNonCodeContent(unstructuredResult.message);

            if (!md || md.length === 0) {
                Logger.error(`No code block found in the response: ${unstructuredResult.message}`);
                throw new Error(`No code block found in the response: ${unstructuredResult.message}`);
            }

            // Get the template with insertion points
            const template = md[0].code;
            
            // Load all source artifacts
            const sourceArtifacts = new Map<string, string>();
            if (params.context?.artifacts) {
                for (const artifactRef of params.context.artifacts) {
                    const artifact = await this.artifactManager.loadArtifact(artifactRef.id);
                    if (artifact) {
                        sourceArtifacts.set(artifactRef.id, artifact.content.toString());
                    }
                }
            }

            // Extract insertion points from template and merge content
            let finalContent = template;
            const insertionPointRegex = /<<<INSERT:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):[^>]+>>>/g;
            let match;
            const usedSources = new Set<string>();
            
            while ((match = insertionPointRegex.exec(template)) !== null) {
                const [fullMatch, sourceId] = match;
                const content = sourceArtifacts.get(sourceId);
                if (content) {
                    finalContent = finalContent.replace(fullMatch, content);
                    usedSources.add(sourceId);
                }
            }

            // Clean up any remaining insertion points
            finalContent = finalContent.replace(/<<<INSERT:[^>]+>>>/g, '');

            // Create the combined artifact
            const artifact = await this.artifactManager.saveArtifact({
                type: this.getArtifactType(),
                content: finalContent,
                metadata: {
                    title: json.title || "Combined Document",
                    operation: 'combine',
                    projectId: params.projectId,
                    sourceArtifacts: Object.fromEntries(sourceArtifacts.entries()),
                    templateUsed: template,
                    insertionPoints: json.insertionPoints
                }
            });

            return {
                type: StepResultType.GenerateArtifact,
                finished: true,
                artifactIds: [artifact?.id],
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.GeneratedArtifact,
                    status: message,
                    data: {
                        generatedArtifactId: artifact?.id,
                        requestFullContext: false
                    }
                }
            };
        } catch (error) {
            Logger.error('Error combining artifacts:', error);
            return {
                type: StepResultType.GenerateArtifact,
                finished: true,
                needsUserInput: true,
                response: {
                    type: StepResponseType.GeneratedArtifact,
                    message: 'Failed to combine artifacts. Please try again later.'
                }
            };
        }
    }
}
