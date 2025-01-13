import { ExecutorConstructorParams, StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { EditingResponse } from '../../schemas/editing';
import { ArtifactManager } from '../../tools/artifactManager';
import { TaskManager } from 'src/tools/taskManager';
import { ExecutorType } from './ExecutorType';

/**
 * Executor that reviews and improves content quality.
 * Key capabilities:
 * - Analyzes content structure and organization
 * - Improves clarity and readability
 * - Fixes grammar and style issues
 * - Suggests content improvements
 * - Maintains version history of edits
 * - Provides detailed edit rationales
 * - Tracks content revisions
 * - Generates improved content versions
 * - Preserves original message intent
 * - Creates structured edit summaries
 */
@StepExecutorDecorator(ExecutorType.EDITING, 'Review and improve content quality')
export class EditingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;
    private taskManager: TaskManager

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = new ModelHelpers(params.llmService, 'executor');
        this.artifactManager = params.artifactManager!;
        this.taskManager = params.taskManager!;
    }

    async executeOld(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.EditingResponse);

        // Get the project metadata to find the content artifact
        const project = await this.taskManager.getProject(projectId);
        if (!project.metadata.contentArtifactId) {
            throw new Error('No content artifact found for editing');
        }

        // Load the content artifact
        const contentArtifact = await this.artifactManager.loadArtifact(project.metadata.contentArtifactId);
        if (!contentArtifact) {
            throw new Error(`Could not load content artifact ${project.metadata.contentArtifactId}`);
        }

        const prompt = `You are a content editor.
First, generate a clear and concise title that captures the main topic of the content.
Then review the content for clarity, structure, style, and grammar.
Provide specific suggestions for improvements while maintaining the original message.

Content to review:
${contentArtifact.content}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate<EditingResponse>({
            message: goal,
            instructions
        });

        // Create a new content artifact with improvements applied
        let updatedContent = contentArtifact.content.toString();
        for (const improvement of result.improvements) {
            for (const suggestion of improvement.suggestions) {
                updatedContent = updatedContent.replace(suggestion.original, suggestion.improved);
            }
        }

        // Save the updated content as a new artifact
        const newArtifact = await this.artifactManager.saveArtifact({
            id: crypto.randomUUID(),
            type: 'content',
            content: updatedContent,
            metadata: {
                ...contentArtifact.metadata,
                previousVersion: contentArtifact.id,
                editingFeedback: result.overallFeedback,
                title: result.title
            }
        });

        // Update the project metadata to point to the new content
        project.metadata = {
            ...project.metadata,
            contentArtifactId: newArtifact.id
        };


        return {
            type: "editing",
            finished: true,
            response: {
                message: `**${result.title}**\n\n**Content Review**\n\n${result.improvements.map(imp =>
                    `### ${imp.section}\n\n${imp.suggestions.map(s =>
                        `**${s.type}**:\n- Original: ${s.original}\n- Improved: ${s.improved}\n- Why: ${s.explanation}`
                    ).join('\n\n')}`
                ).join('\n\n')}\n\n**Overall Feedback:**\n${result.overallFeedback}\n\n*Updated content saved as artifact ${newArtifact.id}*`,
                data: {
                    ...result,
                    updatedArtifactId: newArtifact.id
                }
            }
        };
    }
}
