import { StepExecutor, StepResult } from '../stepBasedAgent';
import { TaskManager } from '../../tools/taskManager';
import { ArtifactManager } from '../../tools/artifactManager';
import { OnboardingProject } from '../onboardingConsultant';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/modelHelpers';
import { ILLMService } from 'src/llm/ILLMService';
import { ExecutorType } from './ExecutorType';

/**
 * Executor that generates user-friendly responses to messages.
 * Key capabilities:
 * - Creates natural, conversational replies
 * - Maintains consistent tone and style
 * - Incorporates project context in responses
 * - Handles both direct replies and follow-up messages
 * - Loads and references relevant artifacts
 * - Manages conversation flow and context
 * - Provides clear and actionable responses
 * - Supports multi-turn dialogue
 * - Ensures responses align with project goals
 */
@StepExecutorDecorator(ExecutorType.REPLY, 'Generate user-friendly responses to messages')
export class ReplyExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(
        llmService: ILLMService,
        private taskManager: TaskManager,
        private artifactManager: ArtifactManager
    ) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async executeOld(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const reply = await this.modelHelpers.generate({
            message: `${step} [${goal}]`,
            instructions: "Generate a user friendly reply",
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
            project.props.existingPlan = await this.artifactManager.loadArtifact(project.props.businessPlanId);
        }

        return project;
    }
}
