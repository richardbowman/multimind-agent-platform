import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { BaseStepExecutor, ModelConversation, StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType, WithMessage } from '../interfaces/StepResult';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact, ArtifactType } from 'src/tools/artifact';
import Logger from '../../helpers/logger';
import { TaskManager } from 'src/tools/taskManager';
import { PromptBuilder, ContentType, OutputType, globalRegistry } from 'src/llm/promptBuilder';
import { ArtifactGenerationResponse, OperationTypes } from 'src/schemas/ArtifactGenerationResponse';
import { StringUtils } from 'src/utils/StringUtils';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { ModelType } from 'src/llm/LLMServiceFactory';
import { CSVUtils } from 'src/utils/CSVUtils';


export interface ArtifactGenerationStepData {
    requestFullContent?: boolean;
    artifactIndex?: number;
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

        globalRegistry.stepResponseRenderers.set(StepResponseType.GeneratedArtifact, async (response : StepResponse, all: StepResponse[]) => {
            const lastGenArtifactStep = all.findLast(r => r?.type === StepResponseType.GeneratedArtifact);
            const isLast = response === lastGenArtifactStep;
            const artifactId = response.data?.generatedArtifactId;
            const artifact : Artifact = artifactId && await this.artifactManager.loadArtifact(artifactId);

            if (artifact) {
                if (response.data?.requestFullContext && isLast) {
                    return `[${artifact.metadata?.title}](/artifact/${artifact.id})\n\`\`\`\n${artifact.content.toString()}\n\`\`\`\n`
                } else {
                    return `[${artifact.metadata?.title}](/artifact/${artifact.id})\n`;
                }
            } else {
                return `Artifact ${artifactId} not found.`
            }
        });
    }

    protected getInstructionByOperation(operation: OperationTypes | 'requestFullContent') : string {
        return operation === "create" ? `Create a NEW document.` :
            operation === "patch" ? `Update specific parts of an EXISTING document using merge conflict style syntax. Use merge conflict syntax to specify changes:
\<<<<<<< SEARCH
text to find and replace
=======
new replacement text
>>>>>>> REPLACE);` :
            operation === "replace" ? `Completely revise an EXISTING document - you must re-type the ENTIRE replacement (you can't say "... this section stays the same...").` :
            operation === "append" ? "Append to the end of an EXISTING document. Provide ONLY the new content." : "";
    }

    protected async createBasePrompt(params: ExecuteParams): Promise<ModelConversation> {
        const promptBuilder = this.startModel(params);

        // Add core instructions
        promptBuilder.addInstruction("In this step, you are generating or modifying a document based on the goal. When you respond, provide a short description of the document you have generated (don't write your message in future tense, you should say 'I successfully created/appended/replaced a document containing...').");
        promptBuilder.addInstruction(`# AVAILABLE OPERATIONS:
1. create: ${this.getInstructionByOperation('create')}
2. replace: ${this.getInstructionByOperation('replace')}
3. patch: ${this.getInstructionByOperation('patch')}
4. append: ${this.getInstructionByOperation('append')}
5. requestFullContent: Request the full content of an existing artifact to determine the best edit operation
`);

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
        // Handle requestFullContent operation
        if (params.context?.stepResponse?.data?.requestFullContent) {
            const artifactIndex = params.context.stepResponse.data.artifactIndex;
            if (artifactIndex != null && params.context?.artifacts?.[artifactIndex]) {
                const artifact = await this.artifactManager.loadArtifact(params.context.artifacts[artifactIndex].id);
                if (artifact) {
                    // Add the full content to the context
                    params.context.artifacts[artifactIndex] = artifact;
                }
            }
        }

        const conversation = await this.createBasePrompt(params);
        const schema = await getGeneratedSchema(SchemaType.ArtifactGenerationResponse)
        
        // Add content formatting rules
        if (this.addContentFormattingRules) this.addContentFormattingRules(conversation);
        conversation.addOutputInstructions({outputType: OutputType.JSON_AND_MARKDOWN, schema, specialInstructions: "", type: this.getSupportedFormats().join(" OR ")});
        
        // Add Q&A context from project metadata

        try {
            const unstructuredResult = await conversation.generate({
                message: params.message || params.stepGoal,
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
                        blockType: md[0].type?.toLowerCase(),
                        operation: result.operation || 'create',
                        projectId: params.projectId,
                        ...(await this.prepareArtifactMetadata(result))
                    }
                };

                if (result.operation !== 'create' && result.artifactIndex != null && result.artifactIndex > 0 && params.context?.artifacts) {
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
                            if (result.operation === 'append') {
                                artifactUpdate.content = `${existingArtifact?.content || ""}\n${result.content}`;
                            } else if (result.operation === 'replace') {
                                artifactUpdate.content = result.content;
                            } else if (result.operation === 'patch') {
                                // Handle merge conflict style editing
                                const existingContent = existingArtifact?.content || "";
                                const editContent = result.content;
                    
                                // Parse the edit content looking for conflict markers
                                const conflictRegex = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g;
                                let finalContent = existingContent;
                                let match;
                    
                                while ((match = conflictRegex.exec(editContent)) !== null) {
                                    const [fullMatch, searchText, replacementText] = match;
                                    // Replace the search text with replacement text in the existing content
                                    finalContent = finalContent.replace(searchText, replacementText);
                                }
                    
                                // If no conflict markers were found, append the edit content
                                if (!match) {
                                    finalContent = `${existingContent}\n${editContent}`;
                                }
                    
                                artifactUpdate.content = finalContent;
                            }
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

                // Handle requestFullContent operation
                if (result.operation === 'requestFullContent' && result.artifactIndex != null) {
                    return {
                        type: StepResultType.GenerateArtifact,
                        finished: false,
                        needsUserInput: false,
                        response: {
                            type: StepResponseType.GeneratedArtifact,
                            data: {
                                requestFullContent: true,
                                artifactIndex: result.artifactIndex
                            }
                        }
                    };
                }

                return {
                    type: StepResultType.GenerateArtifact,
                    finished: true,
                    artifactIds: [artifact?.id],
                    replan: ReplanType.Allow,
                    response: {
                        type: StepResponseType.GeneratedArtifact,
                        status: result.message,
                        data: {
                            generatedArtifactId: artifact?.id,
                            requestFullContext: this.requestFullContext()
                        }
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

    requestFullContext() {
        return false;
    }

    protected async getSupportedSubtypesContent(artifactType: string): Promise<string | undefined> {
        try {
            // Look for the supported subtypes artifact
            const artifacts = await this.artifactManager.getArtifacts({ 
                artifactType, 
                type: ArtifactType.Spreadsheet,
                subtype: `Artifact Subtypes` 
            });
            if (artifacts.length > 0) {
                const artifact = await this.artifactManager.loadArtifact(artifacts[0].id);
                const csv = artifact && await CSVUtils.fromCSV(artifact.content.toString());
                return csv?.rows.map(c => ` - ${c.Subtype}: ${c.Description}`).join("\n");
            }
        } catch (error) {
            Logger.error(`Error loading supported ${artifactType} subtypes:`, error);
        }
        return undefined;
    }

    protected async prepareArtifactMetadata(result: any): Promise<Record<string, any>> {
        return {
            subtype: result.subtype
        };
    }

    abstract getArtifactType(codeBlockType: string): ArtifactType;
}
