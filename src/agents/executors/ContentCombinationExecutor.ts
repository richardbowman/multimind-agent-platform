import { ArtifactManager } from "src/tools/artifactManager";
import { TaskManager } from "src/tools/taskManager";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { ExecutorType } from "../interfaces/ExecutorType";
import { BaseStepExecutor, StepExecutor } from "../interfaces/StepExecutor";
import { StepResponse, StepResult } from "../interfaces/StepResult";
import { Artifact, ArtifactType } from "src/tools/artifact";
import { createUUID } from "src/types/uuid";
import { DraftContentStepResponse } from "./AssignWritersExecutor";
import { CreateArtifact } from "src/schemas/ModelResponse";

@StepExecutorDecorator(ExecutorType.CONTENT_COMBINATION, 'Combine written sections into final content')
export class ContentCombinationExecutor extends BaseStepExecutor<StepResponse> {
    private artifactManager: ArtifactManager;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.artifactManager = params.artifactManager!;
        this.taskManager = params.taskManager;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const { projectId } = params;
        const project = await this.taskManager.getProject(projectId);
        
        if (!project) {
            throw new Error('Project is required for content combination');
        }

        // Collect all structured content from writing tasks
        const sections: Array<{
            heading: string;
            content: string;
            level: number;
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
            const stepResponse = lastWritingStep.props.result?.response as DraftContentStepResponse;

            // Process subProjectResults from the last writing step
            for (const section of stepResponse.data?.sections||[]) {
                if (section.sectionOutput.artifactIds) {
                    const artifacts = await this.artifactManager.bulkLoadArtifacts(section.sectionOutput.artifactIds);
                    
                    sections.push(...artifacts.map(artifact => ({
                        heading: artifact.metadata?.title || 'Untitled Section',
                        content: artifact.content.toString(),
                        level: 1,
                        citations: []
                    })));
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
                
                return `${section.level==1?"##":"###"} ${section.heading}\n\n${section.content}\n\n`;
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
        const content: Partial<Artifact> = {
            content: formattedContent,
            type: ArtifactType.Document,
            metadata: {
                goal: project.name,
                projectId: project.id,
                title: contentTitle,
                sections: sections.map(s => s.heading),
                tokenUsage: totalTokenUsage
            }
        };

        // Save artifact
        const savedArtifact = await this.artifactManager.saveArtifact(content);

        // Store artifact ID in project metadata
        project.metadata.contentArtifactId = savedArtifact.id;

        return {
            finished: true,
            response: {
                message: 'Content successfully combined'
            },
            artifactIds: [savedArtifact.id]
        };
    }
}
