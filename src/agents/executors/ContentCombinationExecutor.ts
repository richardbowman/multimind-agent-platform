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
            if (lastWritingStep.props.result?.response.subProjectResults) {
                for (const subResult of lastWritingStep.props.result.response.subProjectResults) {
                    if (subResult.structure) {
                        // Add main section
                        sections.push({
                            heading: subResult.structure?.heading || 'Untitled Section',
                            content: subResult.message,
                            citations: subResult.citations || []
                        });

                        // Add any subheadings
                        if (subResult.structure?.subheadings) {
                            sections.push(...subResult.structure.subheadings.map(sh => ({
                                heading: sh.title,
                                content: sh.content,
                                citations: subResult.citations || []
                            })));
                        }

                        // Accumulate token usage
                        if (subResult._usage) {
                            totalTokenUsage.inputTokens += subResult._usage.inputTokens || 0;
                            totalTokenUsage.outputTokens += subResult._usage.outputTokens || 0;
                        }
                    }
                }
            }
        }

        // Collect all citations and deduplicate them
        const allCitations = new Map<string, {
            sourceId: string;
            excerpt: string;
            reference?: string;
        }>();

        // Format sections and collect citations
        const formattedSections = sections
            .map(section => {
                // Add citations to the global map
                section.citations.forEach(cite => {
                    allCitations.set(cite.sourceId, cite);
                });
                
                return `## ${section.heading}\n\n${section.content}\n\n`;
            })
            .join('\n\n');

        // Format deduplicated references at the end
        const formattedReferences = Array.from(allCitations.values())
            .map((cite, i) => `${i + 1}. [Source ${cite.sourceId}] ${cite.excerpt}`)
            .join('\n');

        // Combine sections and references
        const formattedContent = `${formattedSections}\n\n## References\n\n${formattedReferences}`;

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
