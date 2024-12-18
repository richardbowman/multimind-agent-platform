import { StepExecutor, StepResult } from '../stepBasedAgent';
import { RequestArtifacts } from '../../schemas/ModelResponse';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { randomUUID } from 'crypto';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact } from 'src/tools/artifact';
import Logger from '../../helpers/logger';

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
@StepExecutorDecorator('generate-artifact', 'Create/revise a Markdown document')
export class GenerateArtifactExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;

    constructor(llmService: ILLMService, artifactManager: ArtifactManager) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.artifactManager = artifactManager;
    }

    async executeOld(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = {
            type: 'object',
            properties: {
                artifactId: { type: 'string' },
                title: { type: 'string' },
                content: { type: 'string' },
                confirmationMessage: { type: 'string' }
            },
            required: ['title', 'content', 'confirmationMessage']
        };

        const prompt = `Generate a title, content for a Markdown document and a confirmation message based on the goal.
Specify the existing artifact ID if you want to revise an existing artifact. Otherwise, leave this field blank.

${previousResult ? `Consider this previous content:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        
        try {
            const result = await this.modelHelpers.generate({
                message: goal,
                instructions
            });

            // Prepare the artifact
            const artifact: Artifact = {
                id: result.artifactId?.length > 0 ? result.artifactId : randomUUID(),
                type: 'markdown',
                content: result.content,
                metadata: {
                    title: result.title
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
                response: {
                    message: 'Failed to generate the artifact. Please try again later.'
                }
            };
        }
    }
}
