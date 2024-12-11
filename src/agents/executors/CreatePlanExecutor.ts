import { StepExecutor, StepResult } from '../stepBasedAgent';
import crypto from 'crypto';
import LMStudioService, { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { updateBusinessPlan } from './businessPlanHelper';
import { TaskManager } from '../../tools/taskManager';
import { ArtifactManager } from '../../tools/artifactManager';
import { OnboardingProject } from '../goalBasedOnboardingConsultant';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/helpers';

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
        const businessGoals = Object.values(project.tasks).filter(t => t.type === 'business-goal');

        const schema = {
            type: "object",
            properties: {
                operationalGuide: {
                    type: "object",
                    properties: {
                        businessContext: { type: "string" },
                        serviceStrategy: { type: "string" },
                        implementationApproach: { type: "string" },
                        keyConsiderations: {
                            type: "array",
                            items: { type: "string" }
                        },
                        recommendedSteps: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    phase: { type: "string" },
                                    description: { type: "string" },
                                    expectedOutcome: { type: "string" },
                                    considerations: { type: "string" }
                                },
                                required: ["phase", "description", "expectedOutcome"]
                            }
                        }
                    },
                    required: ["businessContext", "serviceStrategy", "implementationApproach", "recommendedSteps"]
                },
                summary: { type: "string" }
            },
            required: ["plans", "summary"]
        };

        const businessAnswers = this.getAnswersForType(project, 'business-question');
        const serviceAnswers = this.getAnswersForType(project, 'service-question');

        const response = await this.modelHelpers.generate({
            message: JSON.stringify({
                goals: businessGoals,
                currentPlan: project.existingPlan?.content.toString(),
                projectContext: project.props,
                businessAnswers,
                serviceAnswers
            }),
            instructions: new StructuredOutputPrompt(schema,
                `Create detailed action plans for each business goal.
                Use the provided answers about the business and service requirements to inform the plan.`)
        });

        // Update the business plan with the operational guide
        const businessPlanId = await this.updateProjectBusinessPlan(project, response);

        return {
            type: 'operational_guide',
            finished: true,
            needsUserInput: false,
            response: {
                message: response.summary,
                operationalGuide: response.operationalGuide,
                businessPlanId
            }
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
