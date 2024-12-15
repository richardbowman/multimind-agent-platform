import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/helpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { EditingResponse } from '../../schemas/editing';
import { ArtifactManager } from '../../tools/artifactManager';
import { TaskManager } from 'src/tools/taskManager';

@StepExecutorDecorator('editing', 'Review and improve content quality')
export class EditingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;
    private taskManager: TaskManager

    constructor(llmService: ILLMService, artifactManager: ArtifactManager, taskManager: TaskManager) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.artifactManager = artifactManager;
        this.taskManager = taskManager;
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
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
Review the content for clarity, structure, style, and grammar.
Provide specific suggestions for improvements while maintaining the original message.

Content to review:
${contentArtifact.content}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate<EditingResponse>({
            message: goal,
            instructions
        });

        return {
            type: "editing",
            finished: true,
            response: {
                message: `**Content Review**\n\n${result.improvements.map(imp => 
                    `### ${imp.section}\n\n${imp.suggestions.map(s =>
                        `**${s.type}**:\n- Original: ${s.original}\n- Improved: ${s.improved}\n- Why: ${s.explanation}`
                    ).join('\n\n')}`
                ).join('\n\n')}\n\n**Overall Feedback:**\n${result.overallFeedback}`,
                data: result
            }
        };
    }
}
