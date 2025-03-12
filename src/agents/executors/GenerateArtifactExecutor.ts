import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { BaseStepExecutor, ModelConversation, StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType, WithMessage } from '../interfaces/StepResult';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact, ArtifactType } from 'src/tools/artifact';
import Logger from '../../helpers/logger';
import { TaskManager } from 'src/tools/taskManager';
import { PromptBuilder, ContentType, OutputType } from 'src/llm/promptBuilder';
import { ArtifactGenerationResponse } from 'src/schemas/ArtifactGenerationResponse';
import { StringUtils } from 'src/utils/StringUtils';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { ModelType } from 'src/llm/LLMServiceFactory';


export interface ArtifactGenerationStepData {

}

export interface ArtifactGenerationStepResponse extends StepResponse {
    type: StepResponseType.GeneratedArtifact;
    data?: ArtifactGenerationStepData;
}


/**
 * Executor that generates and manages Markdown document artifacts.
 * Key capabilities:
 * - Creates new Markdown documents with structured content
 * - Revises existing artifacts while maintaining version history
 * - Generates appropriate titles and metadata
 * - Handles both creation and update workflows
 * - Supports artifact versioning and tracking
 * - Manages artifact storage and retrieval
 * - Provides confirmation messages for operations
 * - Handles errors gracefully with logging
 * - Generates unique IDs for new artifacts
 * - Preserves existing IDs during revisions
*/
export abstract class GenerateArtifactExecutor extends BaseStepExecutor<ArtifactGenerationStepResponse> {
    protected modelHelpers: ModelHelpers;
    protected artifactManager: ArtifactManager;
    protected taskManager?: TaskManager;
    protected addContentFormattingRules?(prompt: ModelConversation);
    protected abstract getSupportedFormats(): string[];
    
    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.artifactManager = params.artifactManager!;
        this.taskManager = params.taskManager;
    }

    protected async createBasePrompt(params: ExecuteParams): Promise<ModelConversation> {
        const promptBuilder = this.startModel(params);

        // Add core instructions
        promptBuilder.addInstruction("In this step, you are generating or modifying a document based on the goal. When you respond, provide a short description of the document you have generated (don't write your message in future tense, you should say 'I successfully created/appended/replaced a document containing...').");
        promptBuilder.addInstruction(`You have these options:
1. Create a NEW document (leave artifactId blank and set operation to "create")
2. Completely revise an EXISTING document (specify "artifactIndex" and set operation to "replace")
3. Add to an EXISTING document (specify "artifactIndex" and set operation to "append")`);

        promptBuilder.addInstruction(`IMPORTANT RULES:
- For NEW documents: Use operation="create" and omit artifactIndex
- For EXISTING documents: Use operation="replace" or "append" and provide "artifactIndex" field with the list number of the Attached Artifacts list from above.`);

        promptBuilder.addContext({contentType: ContentType.ABOUT})
        promptBuilder.addContext({contentType: ContentType.GOALS_FULL, params});

        // Add existing artifacts from previous results
        promptBuilder.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts||[]});

        // Add execution parameters
        promptBuilder.addContext({contentType: ContentType.EXECUTE_PARAMS, params});

        // Add previous results if available
        if (params.previousResponses) {
            promptBuilder.addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses});
        }

        const subtypesContent = await this.getSupportedSubtypesContent(this.getArtifactType());

        if (subtypesContent) {
            promptBuilder.addInstruction(`SUPPORTED DOCUMENT SUBTYPES:\n${subtypesContent}`);
            promptBuilder.addInstruction(`When creating a document, specify the most appropriate subtype in your response.`);
        }

        return promptBuilder;
    }


    async execute(params: ExecuteParams, modelType?: ModelType): Promise<StepResult<ArtifactGenerationStepResponse>> {
        const promptBuilder = await this.createBasePrompt(params);
        const schema = await getGeneratedSchema(SchemaType.ArtifactGenerationResponse)
        
        // Add content formatting rules
        if (this.addContentFormattingRules) this.addContentFormattingRules(promptBuilder);
        promptBuilder.addOutputInstructions({outputType: OutputType.JSON_AND_MARKDOWN, schema, specialInstructions: "", type: this.getSupportedFormats().join(" OR ")});
        
        // Add Q&A context from project metadata

        try {
            const unstructuredResult = await this.modelHelpers.generate({
                message: params.message || params.stepGoal,
                instructions: promptBuilder,
                threadPosts: params.context?.threadPosts,
                modelType: modelType||ModelType.DOCUMENT
            });

            const json = StringUtils.extractAndParseJsonBlock<ArtifactGenerationResponse>(unstructuredResult.message, schema);
            const md = StringUtils.extractCodeBlocks(unstructuredResult.message).filter(b => b.type !== 'json');
            const message = StringUtils.extractNonCodeContent(unstructuredResult.message);
            const result = {
                ...json,
                message
            } as WithMessage<ArtifactGenerationResponse> & { content: string };

            if (md && md.length == 0) {
                Logger.error(`No code block found in the response: ${unstructuredResult.message}`);
                throw new Error(`No code block found in the response: ${unstructuredResult.message}`);
            } else {
                result.content = md[0].code;

                // Prepare the artifact
                const artifactUpdate: Partial<Artifact> = {
                    type: this.getArtifactType(md[0].type?.toLowerCase()),
                    content: result.content,
                    metadata: {
                        title: result.title,
                        operation: result.operation || 'create',
                        projectId: params.projectId,
                        ...(await this.prepareArtifactMetadata(result))
                    }
                };

                if (result.artifactIndex && result.artifactIndex > 0 && (result.operation === 'append' || result.operation === 'replace') && params.context?.artifacts) {
                    try {
                        artifactUpdate.id = params.context?.artifacts[result.artifactIndex - 1].id;
                        const existingArtifact = await this.artifactManager.loadArtifact(artifactUpdate.id);
                        
                        // If types don't match, force create new artifact instead
                        const newType = this.getArtifactType(md[0].type?.toLowerCase());
                        if (existingArtifact?.type && newType !== existingArtifact.type) {
                            Logger.warn(`Type mismatch: existing=${existingArtifact.type}, new=${newType}. Forcing new artifact creation.`);
                            delete artifactUpdate.id; // Remove ID to force new artifact
                            result.operation = 'create'; // Update operation
                        } else {
                            artifactUpdate.content = result.operation === 'append' 
                                ? `${existingArtifact?.content || ""}\n${result.content}`
                                : result.content;
                            artifactUpdate.type = existingArtifact?.type;
                        }
                    } catch (error) {
                        Logger.error(`Could not find existing artifact for append operation for artifact index ${result.artifactIndex} ${artifactUpdate.id}`, error);
                    }
                } else {
                    // Validate document type
                    if (!artifactUpdate.type || !Object.values(ArtifactType).includes(artifactUpdate.type)) {
                        throw new Error(`Invalid document type: ${artifactUpdate.type}. Must be one of: ${Object.values(ArtifactType).join(', ')}`);
                    }
                }

                // Save the artifact
                const artifact = await this.artifactManager.saveArtifact(artifactUpdate);

                return {
                    type: StepResultType.GenerateArtifact,
                    finished: true,
                    artifactIds: [artifact?.id],
                    replan: ReplanType.Allow,
                    response: {
                        type: StepResponseType.GeneratedArtifact,
                        status: result.message
                    }
                };
            }
        } catch (error) {
            Logger.error('Error generating artifact:', error);
            return {
                type: StepResultType.GenerateArtifact,
                finished: true,
                needsUserInput: true,
                response: {
                    type: StepResponseType.GeneratedArtifact,
                    message: 'Failed to generate the artifact. Please try again later.'
                }
            };
        }
    }

    protected async getSupportedSubtypesContent(artifactType: string): Promise<string | null> {
        try {
            // Look for the supported subtypes artifact
            const artifacts = await this.artifactManager.getArtifacts({ 
                artifactType, 
                type: ArtifactType.Spreadsheet,
                subtype: `Artifact Subtypes` 
            });
            if (artifacts.length > 0) {
                const artifact = await this.artifactManager.loadArtifact(artifacts[0].id);
                if (artifact?.content && typeof artifact.content === 'string') {
                    return artifact.content;
                }
            }
        } catch (error) {
            Logger.error(`Error loading supported ${artifactType} subtypes:`, error);
        }
        return null;
    }

    protected async prepareArtifactMetadata(result: any): Promise<Record<string, any>> {
        return {
            subtype: result.subtype
        };
    }

    abstract getArtifactType(codeBlockType: string): ArtifactType;
}
