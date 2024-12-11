import { StepExecutor, StepResult } from '../stepBasedAgent';
import LMStudioService from '../../llm/lmstudioService';
import { TaskManager } from '../../tools/taskManager';
import { ArtifactManager } from '../../tools/artifactManager';
import { OnboardingProject } from '../goalBasedOnboardingConsultant';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';

@StepExecutorDecorator('reply', 'Generate user-friendly responses to messages')
export class ReplyExecutor implements StepExecutor {
    constructor(
        private lmStudioService: LMStudioService,
        private taskManager: TaskManager,
        private artifactManager: ArtifactManager
    ) {}

    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const reply = await this.lmStudioService.generate({
            instructions: "Generate a user friendly reply",
            message: `${step} [${goal}]`,
            projects: [project]
        });

        return {
            finished: true,
            needsUserInput: true,
            response: reply
        };
    }

    private async getProjectWithPlan(projectId: string): Promise<OnboardingProject> {
        const project = this.taskManager.getProject(projectId) as OnboardingProject;
        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        if (project.props?.businessPlanId) {
            project.existingPlan = await this.artifactManager.loadArtifact(project.props.businessPlanId);
        }

        return project;
    }
}
