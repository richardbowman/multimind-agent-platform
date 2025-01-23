import { ArtifactManager } from "src/tools/artifactManager";
import { TaskManager } from "src/tools/taskManager";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { ExecutorType } from "../interfaces/ExecutorType";
import { StepExecutor } from "../interfaces/StepExecutor";
import { StepResult } from "../interfaces/StepResult";
import { Artifact } from "src/tools/artifact";
import { createUUID } from "src/types/uuid";

@StepExecutorDecorator(ExecutorType.CONTENT_COMBINATION, 'Combine written sections into final content')
export class ContentCombinationExecutor implements StepExecutor {
    private artifactManager: ArtifactManager;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.artifactManager = params.artifactManager!;
        this.taskManager = params.taskManager;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const { projectId } = params;
        const project = this.taskManager.getProject(projectId);
        
        if (!project) {
            throw new Error('Project is required for content combination');
        }

        // Collect all structured content from writing tasks
        const sections: Array<{
            heading: string;
            content: string;
            citations: Array<{
                sourceId: string;
                excerpt: string;
                reference?: string;
            }>;
        }> = [];

        let totalTokenUsage = {
            inputTokens: 0,
            outputTokens: 0
        };

        // Find the last writing step
        const writingSteps = Object.values(params.steps)
            .filter(step => step.props.stepType === ExecutorType.WRITING)
            .sort((a, b) => b.props.createdAt - a.props.createdAt);

        if (writingSteps.length > 0) {
            const lastWritingStep = writingSteps[0];
            
            // Process subProjectResults from the last writing step
            if (lastWritingStep.props.result?.subProjectResults) {
                for (const subResult of lastWritingStep.props.result.subProjectResults) {
                    if (subResult.response) {
                        // Add main section
                        sections.push({
                            heading: subResult.response.structure?.heading || 'Untitled Section',
                            content: subResult.response.message,
                            citations: subResult.response.citations || []
                        });

                        // Add any subheadings
                        if (subResult.response.structure?.subheadings) {
                            sections.push(...subResult.response.structure.subheadings.map(sh => ({
                                heading: sh.title,
                                content: sh.content,
                                citations: subResult.response.citations || []
                            })));
                        }

                        // Accumulate token usage
                        if (subResult.response._usage) {
                            totalTokenUsage.inputTokens += subResult.response._usage.inputTokens || 0;
                            totalTokenUsage.outputTokens += subResult.response._usage.outputTokens || 0;
                        }
                    }
                }
            }
        }

        // Format final content with citations
        const formattedContent = sections
            .map(section => {
                let content = `## ${section.heading}\n\n${section.content}\n\n`;
                if (section.citations.length > 0) {
                    content += '### References\n\n';
                    content += section.citations
                        .map((cite, i) => `${i + 1}. [Source ${cite.sourceId}] ${cite.excerpt}`)
                        .join('\n');
                    content += '\n\n';
                }
                return content;
            })
            .join('\n\n');

        // Get title from outline task
        const contentTitle = Object.values(params.steps)
            .find(step => step.props.stepType === ExecutorType.OUTLINE)
            ?.props?.result?.response?.data?.title || project.name;

        // Create artifact
        const content: Artifact = {
            id: createUUID(),
            content: formattedContent,
            type: "content",
            metadata: {
                goal: project.name,
                projectId: project.id,
                title: contentTitle,
                sections: sections.map(s => s.heading),
                tokenUsage: totalTokenUsage
            }
        };

        // Save artifact
        await this.artifactManager.saveArtifact(content);

        // Store artifact ID in project metadata
        project.metadata.contentArtifactId = content.id;

        return {
            finished: true,
            response: {
                message: 'Content successfully combined'
            },
            artifactIds: [content.id]
        };
    }
}
