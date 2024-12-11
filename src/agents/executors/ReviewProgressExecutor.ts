import { StepExecutor } from '../decorators/executorDecorator';
import { StepResult } from '../stepBasedAgent';
import { IExecutor } from './IExecutor';
import LMStudioService, { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { TaskManager } from '../../tools/taskManager';
import { ArtifactManager } from '../../tools/artifactManager';
import { OnboardingProject } from '../goalBasedOnboardingConsultant';

export class ReviewProgressExecutor implements IExecutor {
    constructor(
        private lmStudioService: LMStudioService,
        private taskManager: TaskManager,
        private artifactManager: ArtifactManager
    ) {}

    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const tasks = this.taskManager.getAllTasks(projectId);

        const schema = {
            type: "object",
            properties: {
                progress: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            taskId: { type: "string" },
                            status: { 
                                type: "string",
                                enum: ["Not Started", "In Progress", "Blocked", "Complete"]
                            },
                            analysis: { type: "string" },
                            nextSteps: { 
                                type: "array", 
                                items: { type: "string" } 
                            },
                            blockers: { 
                                type: "array", 
                                items: { type: "string" },
                                description: "Any issues preventing progress"
                            }
                        },
                        required: ["taskId", "status", "analysis", "nextSteps"]
                    }
                },
                summary: { type: "string" }
            },
            required: ["progress", "summary"]
        };

        const response = await this.lmStudioService.generate({
            message: JSON.stringify({
                currentGoal: goal,
                tasks: tasks.map(t => ({
                    id: t.id,
                    type: t.type,
                    description: t.description,
                    complete: t.complete,
                    metadata: t.metadata
                }))
            }),
            instructions: new StructuredOutputPrompt(schema,
                `Review the progress of all tasks and provide a detailed status update.`)
        });

        // Update task metadata with latest progress info
        for (const update of response.progress) {
            const task = project.tasks[update.taskId];
            if (task) {
                task.metadata = {
                    ...task.metadata,
                    lastReview: {
                        status: update.status,
                        analysis: update.analysis,
                        nextSteps: update.nextSteps,
                        blockers: update.blockers,
                        reviewedAt: new Date().toISOString()
                    }
                };
            }
        }

        // Update the business plan with latest progress
        await this.updateProjectBusinessPlan(project);

        return {
            type: 'progress_review',
            finished: true,
            needsUserInput: false,
            response: {
                message: response.summary,
                progress: response.progress
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

    private async updateProjectBusinessPlan(project: OnboardingProject): Promise<string> {
        const businessPlanId = await this.updateBusinessPlan(project, project.existingPlan);
        
        project.props = {
            ...project.props,
            businessPlanId
        };

        return businessPlanId;
    }
}
