import { StepExecutor, StepResult } from '../stepBasedAgent';
import crypto from 'crypto';
import LMStudioService, { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { definitions as generatedSchemaDef } from "../schemas/schema.json";
import { OperationalGuideResponse } from '../schemas/OperationalGuideResponse';
import { updateBusinessPlan } from './businessPlanHelper';
import { TaskManager } from '../../tools/taskManager';
import { ArtifactManager } from '../../tools/artifactManager';
import { OnboardingProject } from '../goalBasedOnboardingConsultant';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/helpers';
import { CreateArtifact } from '../schemas/ModelResponse';

@StepExecutorDecorator('create_plan', 'Create detailed action plans for each business goal')
export class CreatePlanExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private userId: string;

    constructor(
        llmService: LMStudioService,
        private taskManager: TaskManager,
        private artifactManager: ArtifactManager,
        userId: string
    ) {
        this.userId = userId;
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const businessGoals = Object.values(project.tasks).filter(t => t.type === 'create-plan');

        const schema = generatedSchemaDef.OperationalGuideResponse;

        const answers = this.getAnswersForType(project, 'process-answers');

        const response : OperationalGuideResponse = await this.modelHelpers.generate({
            message: JSON.stringify({
                goals: businessGoals,
                currentPlan: project.existingPlan?.content.toString(),
                projectContext: project.props,
                answers
            }),
            instructions: new StructuredOutputPrompt(schema,
                `Create detailed action plans for each business goal.
                Use the provided answers about the business and service requirements to inform the plan.`)
        });

        // Update the business plan with the operational guide
        const businessPlanId = await this.updateProjectBusinessPlan(project, response);

        // mark all tasks we were able to incorporate as complete
        for (const planTask of businessGoals) {
            this.taskManager.completeTask(planTask.id);
        }

        // Format the response message to include the artifact reference
        const responseMessage = `${response.summary}\n\n---\nI've created a detailed business plan (${businessPlanId}) that outlines the operational strategy and next steps.`;

        return {
            type: 'operational_guide',
            finished: true,
            needsUserInput: false,
            response: {
                message: responseMessage,
                artifactId: businessPlanId,
                artifactTitle: "Business Plan"
            } as CreateArtifact
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

    private getAnswersForType(project: OnboardingProject, questionType: string): QuestionAnswer[] {
        if (!project.answers) return [];
        
        return project.answers.filter(answer => {
            const task = project.tasks[answer.questionId];
            return task?.type === questionType;
        });
    }

    private async updateProjectBusinessPlan(project: OnboardingProject, response: any): Promise<string> {
        const businessPlanId = await updateBusinessPlan(
            project, 
            this.modelHelpers, 
            this.artifactManager, 
            project.existingPlan,
            response.operationalGuide
        );
        
        project.props = {
            ...project.props,
            businessPlanId
        };

        return businessPlanId;
    }
}
