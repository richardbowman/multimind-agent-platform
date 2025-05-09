import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { ModelConversation } from '../interfaces/StepExecutor';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType, WithMessage } from '../interfaces/StepResult';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact, ArtifactMetadata, ArtifactType } from 'src/tools/artifact';
import Logger from '../../helpers/logger';
import { TaskManager } from 'src/tools/taskManager';
import { ContentType, OutputType, globalRegistry } from 'src/llm/promptBuilder';
import { ArtifactGenerationResponse, OperationTypes } from 'src/schemas/ArtifactGenerationResponse';
import { StringUtils } from 'src/utils/StringUtils';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { ModelType } from "src/llm/types/ModelType";
import { CSVUtils } from 'src/utils/CSVUtils';
import { asUUID, isUUID, UUID } from 'src/types/uuid';
import { RetryError, withRetry } from 'src/helpers/retry';
import { asError } from 'src/types/types';


export interface ArtifactGenerationStepData {
    generatedArtifactId: UUID;
    requestFullContext: boolean;
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
    protected addContentFormattingRules?(prompt: ModelConversation<ArtifactGenerationStepResponse>);
    protected abstract getSupportedFormat(): string;

    protected getContentRules(): Promise<string> | string {
        return "the document contents"
    }

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.artifactManager = params.artifactManager!;
        this.taskManager = params.taskManager;

        globalRegistry.stepResponseRenderers.set(StepResponseType.GeneratedArtifact, async (untypedResponse: StepResponse, all: StepResponse[]) => {
            const response = untypedResponse as ArtifactGenerationStepResponse;
            const lastGenArtifactStep = all.findLast(r => r?.type === StepResponseType.GeneratedArtifact) as ArtifactGenerationStepResponse;
            const isLast = response === lastGenArtifactStep;
            const artifactId = response.data?.generatedArtifactId;
            const artifact: Artifact | undefined | null = artifactId && await this.artifactManager.loadArtifact(artifactId);

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

    protected getInstructionByOperation(operation: OperationTypes | 'requestFullContent'): string {
        return operation === "create" ? `Create a NEW document.` :
            operation === "patch" ? `Update specific parts of an EXISTING document using merge conflict style syntax. To specify changes, use one or more of these SEARCH / REPLACE blocks:
\<<<<<<< SEARCH
text to find and replace
=======
new replacement text
>>>>>>> REPLACE\n
 
You must use the EXACT text from the original document. Use requestFullContent to get the full content if you do not have access to it.` :
            operation === "replace" ? `Completely revise an EXISTING document - you must re-type the ENTIRE replacement (you can't say "... this section stays the same...").` :
            operation === "append" ? "Append to the end of an EXISTING document. Provide ONLY the new content." : 
            operation === "requestFullContent" ? "Request full content of an artifact prior to editing it." : "";
    }

    protected getAvailableOperations(): OperationTypes[] {
        return ['create', 'replace', 'patch', 'append', 'requestFullContent'];
    }

    protected async createBasePrompt(params: ExecuteParams): Promise<ModelConversation<StepResponse>> {
        const promptBuilder = this.startModel(params);

        // Add core instructions
        promptBuilder.addInstruction(`YOUR PURPOSE AND CAPABILITY: You are a tool in a workflow. You can generate or modify a
 SINGLE ${this.getSupportedFormat()} document based on the goal. When you respond, provide a short description of the document you have
  generated (don't write your message in future tense, you should say 'I successfully created/appended/replaced a document containing...').`);

        // Build operations list dynamically
        const operationsList = this.getAvailableOperations()
            .map((op, i) => `${i + 1}. ${op}: ${this.getInstructionByOperation(op)}`)
            .join('\n');

        promptBuilder.addInstruction(`# AVAILABLE ARTIFACT OPERATIONS:\n${operationsList}`);

        promptBuilder.addContext({ contentType: ContentType.ABOUT })
        promptBuilder.addContext({ contentType: ContentType.GOALS_FULL, params });

        // Add existing artifacts from previous results
        promptBuilder.addContext({ contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts || [] });

        // Add execution parameters
        promptBuilder.addContext({ contentType: ContentType.EXECUTE_PARAMS, params });

        // Add previous results if available
        if (params.previousResponses) {
            promptBuilder.addContext({ contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses });
        }

        const subtypesContent = await this.getSupportedSubtypesContent(this.getArtifactType());

        if (subtypesContent) {
            promptBuilder.addInstruction(`SUPPORTED DOCUMENT SUBTYPES:\n${subtypesContent}`);
            promptBuilder.addInstruction(`When creating a document, specify the most appropriate subtype in your response.`);
        }

        return promptBuilder;
    }


    async execute(params: ExecuteParams, modelType?: ModelType): Promise<StepResult<ArtifactGenerationStepResponse>> {
        const retryCount = 0;
        const maxRetries = 1; // Only retry once after getting full content

        let artifactIndex = -1, existingArtifact: Artifact | null = null;

        return withRetry<StepResult<ArtifactGenerationStepResponse>>(async () => {
            const conversation = await this.createBasePrompt(params);
            const schema = await getGeneratedSchema(SchemaType.ArtifactGenerationResponse)
            const tag = `artifact_${this.getSupportedFormat()}`;
            const statusMessages: string[] = [];

            // Add content formatting rules
            if (this.addContentFormattingRules) this.addContentFormattingRules(conversation);
            const rules = await this.getContentRules();
            conversation.addOutputInstructions({ outputType: OutputType.JSON_AND_XML, schema, specialInstructions: rules, type: tag });

            // Add loaded artifact
            if (existingArtifact) {
                conversation.addContext(`FULL ARTIFACT (INDEX ${artifactIndex}) CONTENT:\n\`\`\`\n${existingArtifact.content}\n\'\'\'`);
            }

            try {
                const unstructuredResult = await conversation.generate({
                    message: params.message || params.stepGoal,
                    modelType: modelType || ModelType.DOCUMENT
                });

                let result, documentContent;
                try {
                    const json = StringUtils.extractAndParseJsonBlock<ArtifactGenerationResponse>(unstructuredResult.message, schema);
                    documentContent = StringUtils.extractXmlBlock(unstructuredResult.message, tag);
                    // Strip any code block formatting tags from the content
                    if (documentContent) documentContent = this.stripCodeBlockFormatting(documentContent);
                    const message = StringUtils.extractNonCodeContent(unstructuredResult.message, ["thinking", tag]);
                    result = {
                        ...json,
                        message
                    } as WithMessage<ArtifactGenerationResponse> & { content: string };
                } catch (error) {
                    throw new RetryError(`You must follow the required format: ${asError(error).message}`);
                }

                // Handle requestFullContent operation
                if (result.operation === 'requestFullContent') {
                    if (params.context?.artifacts && result.artifactIndex != null) {
                        // Handle both numeric index and UUID string
                        if (typeof result.artifactIndex === 'number') {
                            existingArtifact = await this.artifactManager.loadArtifact(params.context.artifacts[result.artifactIndex].id);
                            artifactIndex = result.artifactIndex;
                        } else if (StringUtils.isString(result.artifactIndex) && isUUID(result.artifactIndex)) {
                            existingArtifact = await this.artifactManager.loadArtifact(result.artifactIndex);
                            artifactIndex = params.context.artifacts.findIndex(a => a.id === result.artifactIndex);
                        }
                        throw new RetryError("Retry with full artifact provided");
                    } else {
                        throw new Error("Request full content requested but no artifacts avaialble or artifactIndex not specified");
                    }
                }

                if (!documentContent || documentContent?.length == 0) {
                    Logger.error(`No document block found in the response: ${unstructuredResult.message}`);
                    throw new RetryError(`Your response must include the required <${tag}> containing the document.`);
                } else {
                    result.content = documentContent;

                }

                // Prepare the artifact
                const artifactUpdate: Partial<Artifact> = {
                    type: this.getArtifactType(),
                    content: result.content,
                    metadata: {
                        title: result.title,
                        blockType: this.getSupportedFormat(),
                        operation: result.operation || 'create',
                        projectId: params.projectId,
                        ...(await this.prepareArtifactMetadata(result))
                    }
                };

                if (result.operation !== 'create' && result.artifactIndex != null && params.context?.artifacts) {
                    // Handle both numeric index and UUID string
                    if (typeof result.artifactIndex === 'number' && result.artifactIndex > 0) {
                        artifactUpdate.id = params.context.artifacts[result.artifactIndex - 1].id;
                    } else if (typeof result.artifactIndex === 'string' && isUUID(result.artifactIndex)) {
                        artifactUpdate.id = asUUID(result.artifactIndex);
                    } else if (typeof result.artifactIndex === 'string') {
                        try {
                            artifactUpdate.id = params.context.artifacts[parseInt(result.artifactIndex) - 1].id;
                        } catch (error) {
                            Logger.error(`Failed to parse artifact index ${result.artifactIndex} during generation.`);
                        }
                    }


                    const existingArtifact = artifactUpdate.id && await this.artifactManager.loadArtifact(artifactUpdate.id);

                    // If types don't match, force create new artifact instead
                    const newType = this.getArtifactType();
                    if (existingArtifact?.type && newType !== existingArtifact.type) {
                        Logger.warn(`Type mismatch: existing=${existingArtifact.type}, new=${newType}. Forcing new artifact creation.`);
                        delete artifactUpdate.id; // Remove ID to force new artifact
                        result.operation = 'create'; // Update operation
                    } else {
                        if (result.operation === 'append') {
                            try {
                                artifactUpdate.content = await this.validateAndPrepareAppendContent(result.content, existingArtifact?.content.toString() || "");
                            } catch (error) {
                                Logger.error('Artifact append validation failed:', error);
                                throw new RetryError(`Append operation failed: ${asError(error).message}`);
                            }
                        } else if (result.operation === 'replace') {
                            artifactUpdate.content = result.content;
                        } else if (result.operation === 'patch') {
                            // Handle merge conflict style editing
                            const existingContent = existingArtifact?.content || "";
                            const editContent = result.content;

                            // Parse the edit content looking for conflict markers
                            const conflictRegex = /<<<<<<< SEARCH\s([\s\S]*?)\s=======\s([\s\S]*?)\s>>>>>>> REPLACE/g;
                            let finalContent = existingContent.toString();
                            let match, replaceBlocks = 0, unmatchedBlocks = 0;

                            while ((match = conflictRegex.exec(editContent)) !== null) {
                                replaceBlocks++;
                                const [fullMatch, searchText, replacementText] = match;
                                if (finalContent.includes(searchText)) {
                                    finalContent = finalContent.replace(searchText, replacementText);
                                } else {
                                    statusMessages.push(`The search text "${searchText}" was not found. Please sure you provide the exact text from the document.`);
                                }
                            }

                            // update the existing artifact if we made progress towards matches
                            if (existingArtifact) {
                                existingArtifact.content = finalContent;
                            }    

                            if (replaceBlocks === 0) {
                                statusMessages.push(`No valid SEARCH/REPLACE blocks found. To use 'patch' you must provide the exact change using one or more SEARCH/REPLACE blocks:
\<<<<<<< SEARCH
text to find and replace
=======
new replacement text
>>>>>>> REPLACE`);
                            }
                            if (statusMessages.length > 0) {
                                throw new RetryError(statusMessages.join("\n"));
                            }

                            artifactUpdate.content = finalContent;
                        }
                        artifactUpdate.type = existingArtifact?.type;
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
                        status: `${result.message}${statusMessages.length > 0 ? "\n\n" + statusMessages.join(`\n`) : ""}`,
                        data: {
                            generatedArtifactId: artifact?.id,
                            requestFullContext: this.requestFullContext()
                        }
                    }
                };
            } catch (error) {
                if (error instanceof RetryError) throw error;

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
        }, () => true, { maxAttempts: 4, timeoutMs: 180000 });
    }

    protected async validateAndPrepareAppendContent(newContent: string, existingContent: string): Promise<string> {
        return `${existingContent || ""}\n${newContent}`;
    }

    requestFullContext() {
        return false;
    }

    protected async getSupportedSubtypesContent(artifactType: string): Promise<string | undefined> {
        try {
            // Look for the supported subtypes artifact
            const artifacts = await this.artifactManager.getArtifacts({
                type: ArtifactType.Spreadsheet,
                'metadata.artifactType': artifactType,
                'metadata.artifactSubtype': `Artifact Subtypes`
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

    protected stripCodeBlockFormatting(content: string): string {
        if (!StringUtils.isNonEmptyString(content)) return content;

        // Only remove outer formatting tags if the entire content is wrapped in them
        const outerFormatRegex = /^```[a-zA-Z]*\s([\s\S]*)\s```$/;
        const match = content.match(outerFormatRegex);
        return match ? match[1].trim() : content;
    }

    protected async prepareArtifactMetadata(result: any): Promise<ArtifactMetadata> {
        return {
            subtype: result.subtype
        };
    }

    abstract getArtifactType(codeBlockType?: string): ArtifactType;
}
