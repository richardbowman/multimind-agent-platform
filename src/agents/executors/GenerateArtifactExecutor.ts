import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';
import { RequestArtifacts } from '../../schemas/ModelResponse';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { randomUUID } from 'crypto';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact } from 'src/tools/artifact';
import Logger from '../../helpers/logger';
import { ExecutorType } from '../interfaces/ExecutorType';
import { TaskManager } from 'src/tools/taskManager';
import { PromptBuilder, ContentType } from 'src/llm/promptBuilder';
import { createUUID } from 'src/types/uuid';
import { contentType } from 'mime-types';
import { ArtifactGenerationResponse } from 'src/schemas/ArtifactGenerationResponse';
import { StructuredOutputPrompt } from 'src/llm/ILLMService';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';

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
@StepExecutorDecorator(ExecutorType.GENERATE_ARTIFACT, 'Create/revise a Markdown document')
export class GenerateArtifactExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;

    private taskManager?: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.artifactManager = params.artifactManager!;
        this.taskManager = params.taskManager;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const promptBuilder = this.modelHelpers.createPrompt();

        // Add core instructions
        promptBuilder.addInstruction("Generate or modify a Markdown document based on the goal.");
        promptBuilder.addInstruction(`You have these options:
1. Create a NEW document (leave artifactId blank and set operation to "create")
2. Replace an EXISTING document (specify artifactId and set operation to "replace")
3. Append to an EXISTING document (specify artifactId and set operation to "append")`);

        promptBuilder.addInstruction(`Provide:
- artifactId: ID of document to modify (only required for replace/append operations)
- operation: Must be "create" for new documents, "replace" or "append" for existing ones
- title: Document title
- content: New or additional content
- confirmationMessage: Message describing what was done`);

        promptBuilder.addInstruction(`IMPORTANT RULES:
- For NEW documents: Use operation="create" and omit artifactId
- For EXISTING documents: Use operation="replace" or "append" and provide artifactId`);

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
        promptBuilder.addContent(ContentType.ARTIFACTS, params.context?.artifacts);

        // Add execution parameters
        promptBuilder.addContent(ContentType.EXECUTE_PARAMS, {
            goal: params.goal,
            stepGoal: params.stepGoal
        });

        // Add previous results if available
        if (params.previousResult) {
            promptBuilder.addContent(ContentType.STEP_RESULTS, params.previousResult);
        }

        const prompt = promptBuilder.build();
        
        try {
            const schema = await getGeneratedSchema(SchemaType.ArtifactGenerationResponse);
            const result = await this.modelHelpers.generate<ArtifactGenerationResponse>({
                message: params.message || params.stepGoal,
                instructions: new StructuredOutputPrompt(schema, prompt)
            });

            // Prepare the artifact
            let finalContent = result.content;
            if (result.artifactId && result.operation === 'append') {
                const existingArtifact = await this.artifactManager.loadArtifact(result.artifactId);
                finalContent = `${existingArtifact?.content||""}\n\n${result.content}`;
            }

            const artifact: Artifact = {
                id: result.artifactId?.length||0 > 0 ? createUUID(result.artifactId) : createUUID(),
                type: 'markdown',
                content: finalContent,
                metadata: {
                    title: result.title,
                    operation: result.operation || 'create',
                    previousVersion: result.artifactId ? result.artifactId : undefined,
                    projectId: params.projectId
                }
            };

            // Save the artifact
            await this.artifactManager.saveArtifact(artifact);

            return {
                type: "generate-artifact",
                finished: true,
                artifactIds: [artifact.id],
                response: {
                    message: result.confirmationMessage,
                } as RequestArtifacts
            };

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
