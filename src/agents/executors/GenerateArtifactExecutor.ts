import { ExecuteParams, ExecutorConstructorParams, StepExecutor, StepResult } from '../stepBasedAgent';
import { RequestArtifacts } from '../../schemas/ModelResponse';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { randomUUID } from 'crypto';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact } from 'src/tools/artifact';
import Logger from '../../helpers/logger';
import { ExecutorType } from './ExecutorType';

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
        this.modelHelpers = new ModelHelpers(params.llmService, 'executor');
        this.artifactManager = params.artifactManager!;
        this.taskManager = params.taskManager;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const schema = {
            type: 'object',
            properties: {
                artifactId: { type: 'string' },
                operation: { 
                    type: 'string',
                    enum: ['replace', 'append']
                },
                title: { type: 'string' },
                content: { type: 'string' },
                confirmationMessage: { type: 'string' }
            },
            required: ['title', 'content', 'confirmationMessage'],
            dependencies: {
                artifactId: {
                    required: ['operation']
                }
            }
        };

        // Get Q&A context from project metadata
        let qaContext = '';
        try {
            const project = this.taskManager?.getProject(params.projectId);
            if (project?.metadata?.answers) {
                qaContext = `Relevant Q&A Context:\n${
                    project.metadata.answers.map((a: any) => 
                        `Q: ${a.question}\nA: ${a.answer}\n`
                    ).join('\n')
                }\n\n`;
            }
        } catch (error) {
            Logger.warn('Failed to fetch Q&A context:', error);
        }

        // Get existing artifacts from previous results
        let existingContent = '';
        const artifactIds = params.previousResult?.flatMap(r => r.response?.artifactIds || []) || [];
        
        if (artifactIds.length > 0) {
            try {
                const artifacts = await Promise.all(
                    artifactIds.map(id => this.artifactManager.loadArtifact(id))
                );
                
                existingContent = `Existing artifacts:\n${
                    artifacts.map((a, i) => 
                        `- Artifact ID: ${artifactIds[i]}\n` +
                        `  Title: ${a.metadata?.title || 'Untitled'}\n` +
                        `  Content:\n${a.content}\n`
                    ).join('\n')
                }\n\n`;
            } catch (error) {
                Logger.warn('Failed to fetch existing artifacts:', error);
            }
        }

        const prompt = `${qaContext}Generate or modify a Markdown document based on the goal.
You have these options:
1. Create a new document (leave artifactId blank)
2. Replace an existing document (specify artifactId and set operation to "replace")
3. Append to an existing document (specify artifactId and set operation to "append")

${existingContent}

Provide:
- artifactId: ID of document to modify (or blank for new)
- operation: "replace" or "append" (only if artifactId provided)
- title: Document title
- content: New or additional content
- confirmationMessage: Message describing what was done`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        
        try {
            const result = await this.modelHelpers.generate({
                message: params.message || params.stepGoal,
                instructions
            });

            // Prepare the artifact
            let finalContent = result.content;
            if (result.artifactId && result.operation === 'append') {
                const existingArtifact = await this.artifactManager.loadArtifact(result.artifactId);
                finalContent = `${existingArtifact?.content||""}\n\n${result.content}`;
            }

            const artifact: Artifact = {
                id: result.artifactId?.length > 0 ? result.artifactId : randomUUID(),
                type: 'markdown',
                content: finalContent,
                metadata: {
                    title: result.title,
                    operation: result.operation || 'create',
                    previousVersion: result.artifactId ? result.artifactId : undefined
                }
            };

            // Save the artifact
            await this.artifactManager.saveArtifact(artifact);

            return {
                type: "generate-artifact",
                finished: true,
                response: {
                    message: `${result.confirmationMessage} Your artifact titled "${result.title}" has been generated and saved. You can find it under ID: ${artifact.id}`,
                    artifactIds: [artifact.id]
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
