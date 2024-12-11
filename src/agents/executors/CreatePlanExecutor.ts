import { StepExecutor, StepResult } from '../stepBasedAgent';
import LMStudioService, { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { TaskManager } from '../../tools/taskManager';
import { ArtifactManager } from '../../tools/artifactManager';
import { OnboardingProject } from '../goalBasedOnboardingConsultant';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';

@StepExecutorDecorator('create_plan', 'Create detailed action plans for each business goal')
export class CreatePlanExecutor implements StepExecutor {
    constructor(
        private lmStudioService: LMStudioService,
        private taskManager: TaskManager,
        private artifactManager: ArtifactManager
    ) {}

    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const businessGoals = Object.values(project.tasks).filter(t => t.type === 'business-goal');

        const schema = {
            type: "object",
            properties: {
                plans: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            goalId: { type: "string" },
                            actionItems: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        description: { type: "string" },
                                        timeline: { type: "string" },
                                        resources: { type: "string" },
                                        dependencies: { 
                                            type: "array",
                                            items: { type: "string" }
                                        }
                                    },
                                    required: ["description", "timeline", "resources"]
                                }
                            }
                        },
                        required: ["goalId", "actionItems"]
                    }
                },
                summary: { type: "string" }
            },
            required: ["plans", "summary"]
        };

        const businessAnswers = this.getAnswersForType(project, 'business-question');
        const serviceAnswers = this.getAnswersForType(project, 'service-question');

        const response = await this.lmStudioService.generate({
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

        // Create tasks for each action item
        for (const plan of response.plans) {
            const parentGoal = project.tasks[plan.goalId];
            if (!parentGoal) continue;

            for (const action of plan.actionItems) {
                await this.taskManager.addTask({
                    projectId,
                    type: 'action-item',
                    description: action.description,
                    metadata: {
                        timeline: action.timeline,
                        resources: action.resources,
                        dependencies: action.dependencies
                    },
                    dependsOn: plan.goalId
                });
            }
        }

        // Update the business plan with the new action items
        const businessPlanId = await this.updateProjectBusinessPlan(project);

        return {
            type: 'action_plans',
            finished: true,
            needsUserInput: false,
            response: {
                message: response.summary,
                plans: response.plans,
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

    private async updateProjectBusinessPlan(project: OnboardingProject): Promise<string> {
        const businessPlanId = await this.updateBusinessPlan(project, project.existingPlan);
        
        project.props = {
            ...project.props,
            businessPlanId
        };

        return businessPlanId;
    }
}
