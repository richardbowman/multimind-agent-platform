import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResponse, StepResponseType, StepResult, WithMessage } from '../interfaces/StepResult';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact } from 'src/tools/artifact';
import Logger from '../../helpers/logger';
import { TaskManager } from 'src/tools/taskManager';
import { PromptBuilder, ContentType, OutputType } from 'src/llm/promptBuilder';
import { ArtifactGenerationResponse } from 'src/schemas/ArtifactGenerationResponse';
import { StringUtils } from 'src/utils/StringUtils';
import { JSONSchema } from 'src/llm/ILLMService';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';


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
export abstract class GenerateArtifactExecutor implements StepExecutor<ArtifactGenerationStepResponse> {
    protected modelHelpers: ModelHelpers;
    protected artifactManager: ArtifactManager;
    protected taskManager?: TaskManager;
    protected addContentFormattingRules?(prompt: PromptBuilder);
    protected abstract getSupportedFormats(): string[];
    
    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.artifactManager = params.artifactManager!;
        this.taskManager = params.taskManager;
    }

    protected createBasePrompt(params: ExecuteParams): PromptBuilder {
        const promptBuilder = this.modelHelpers.createPrompt();

        // Add core instructions
        promptBuilder.addInstruction("Generate or modify a document based on the goal.");
        promptBuilder.addInstruction(`You have these options:
1. Create a NEW document (leave artifactId blank and set operation to "create")
2. Replace an EXISTING document (specify artifactId and set operation to "replace")
3. Append to an EXISTING document (specify artifactId and set operation to "append")`);

        promptBuilder.addInstruction(`IMPORTANT RULES:
- For NEW documents: Use operation="create" and omit artifactIndex
- For EXISTING documents: Use operation="replace" or "append" and provide "artifactIndex" field with the list number of the Attached Artifacts list from above.`);

        // Add Q&A context from project metadata
        try {
            const project = this.taskManager?.getProject(params.projectId);
            if (project?.metadata?.answers) {
                promptBuilder.addContent(ContentType.DOCUMENTS, {
                    title: "Q&A Context",
                    content: project.metadata.answers.map((a: any) =>
                        `Q: ${a.question}\nA: ${a.answer}`
                    ).join('\n\n')
                });
            }
        } catch (error) {
            Logger.warn('Failed to fetch Q&A context:', error);
        }

        // Add existing artifacts from previous results
        promptBuilder.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts||[]});

        // Add execution parameters
        promptBuilder.addContext({contentType: ContentType.EXECUTE_PARAMS, params});

        // Add previous results if available
        if (params.previousResponses) {
            promptBuilder.addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses});
        }

        return promptBuilder;
    }


    async execute(params: ExecuteParams): Promise<StepResult<ArtifactGenerationStepResponse>> {
        const promptBuilder = this.createBasePrompt(params);
        const schema = await getGeneratedSchema(SchemaType.ArtifactGenerationResponse)
        
        // Add content formatting rules
        if (this.addContentFormattingRules) this.addContentFormattingRules(promptBuilder);
        promptBuilder.addOutputInstructions(OutputType.JSON_AND_MARKDOWN, schema, "", this.getSupportedFormats().join("|"));
        
        // Add Q&A context from project metadata

        try {
            const unstructuredResult = await this.modelHelpers.generate({
                message: params.message || params.stepGoal,
                instructions: promptBuilder,
                threadPosts: params.context?.threadPosts
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
                    type: md[0].type?.toLowerCase(),
                    content: result.content,
                    metadata: {
                        title: result.title,
                        operation: result.operation || 'create',
                        projectId: params.projectId
                    }
                };

                if (result.artifactIndex && result.artifactIndex > 0 && result.operation === 'append' && params.context?.artifacts) {
                    try {
                        artifactUpdate.id = params.context?.artifacts[result.artifactIndex - 1].id;
                        const existingArtifact = await this.artifactManager.loadArtifact(artifactUpdate.id);
                        artifactUpdate.content = `${existingArtifact?.content || ""}\n${result.content}`;
                        artifactUpdate.type = existingArtifact?.type;
                    } catch (error) {
                        Logger.error(`Could not find existing artifact for append operation ${artifactUpdate.id}`, error);
                    }
                } else {
                    // Validate document type
                    const validTypes = ['markdown', 'csv', 'mermaid'];
                    if (!artifactUpdate.type || !validTypes.includes(artifactUpdate.type)) {
                        throw new Error(`Invalid document type: ${artifactUpdate.type}. Must be one of: ${validTypes.join(', ')}`);
                    }
                }

                // Save the artifact
                const artifact = await this.artifactManager.saveArtifact(artifactUpdate);

                return {
                    type: "generate-artifact",
                    finished: true,
                    artifactIds: [artifact?.id],
                    response: {
                        type: StepResponseType.GeneratedArtifact,
                        message: result.message
                    }
                };
            }
        } catch (error) {
            Logger.error('Error generating artifact:', error);
            return {
                type: "generate-artifact",
                finished: true,
                needsUserInput: true,
                response: {
                    message: 'Failed to generate the artifact. Please try again later.'
                }
            };
        }
    }
}
