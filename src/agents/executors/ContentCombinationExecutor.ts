<<<<<<< HEAD
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { Artifact } from 'src/tools/artifact';
import { ArtifactManager } from 'src/tools/artifactManager';
import { StepResult } from '../interfaces/StepResult';
import { TaskManager } from 'src/tools/taskManager';
import { createUUID } from 'src/types/uuid';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
=======
import { StepExecutorDecorator } from '../decorators/stepExecutorDecorator';
import { ExecutorType } from '../interfaces/executorTypes';
import { ExecuteParams, StepResult } from '../interfaces/ExecuteParams';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { Artifact } from 'src/tools/artifact';
import { randomUUID } from 'crypto';
import { Project } from 'src/tools/taskManager';
>>>>>>> 58eba9b7 (refactor: extract content combination logic into ContentCombinationExecutor)

@StepExecutorDecorator(ExecutorType.CONTENT_COMBINATION, 'Combine written sections into final content')
export class ContentCombinationExecutor implements StepExecutor {
    private artifactManager: ArtifactManager;
<<<<<<< HEAD
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.artifactManager = params.artifactManager!;
        this.taskManager = params.taskManager;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const { projectId } = params;
        const project = this.taskManager.getProject(projectId);
=======

    constructor(params: ExecutorConstructorParams) {
        this.artifactManager = params.artifactManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const { project } = params;
>>>>>>> 58eba9b7 (refactor: extract content combination logic into ContentCombinationExecutor)
        
        if (!project) {
            throw new Error('Project is required for content combination');
        }

        // Combine all task content
<<<<<<< HEAD
        const finalContent = Object.values(params.steps).find(step => step.props.stepType == 'assign-writers')?.props?.result?.response?.message;

        // Create artifact
        const content: Artifact = {
            id: createUUID(),
=======
        const finalContent = Object.values(project.tasks)
            .filter(task => task.props?.content)
            .map(task => task.props.content)
            .join('\n\n');

        // Create artifact
        const content: Artifact = {
            id: randomUUID(),
>>>>>>> 58eba9b7 (refactor: extract content combination logic into ContentCombinationExecutor)
            content: finalContent,
            type: "content",
            metadata: {
                goal: project.name,
                projectId: project.id
            }
        };

        // Save artifact
        await this.artifactManager.saveArtifact(content);

        // Store artifact ID in project metadata
        project.metadata.contentArtifactId = content.id;

        return {
<<<<<<< HEAD
            finished: true,
            response: {
                message: 'Content successfully combined'
            },
            artifactIds: [content.id]
=======
            success: true,
            message: 'Content successfully combined',
            artifacts: [content]
>>>>>>> 58eba9b7 (refactor: extract content combination logic into ContentCombinationExecutor)
        };
    }
}
