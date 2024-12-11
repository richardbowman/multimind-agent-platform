import { StepExecutor, StepResult } from '../stepBasedAgent';
import LMStudioService, { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { TaskManager } from '../../tools/taskManager';
import { ArtifactManager } from '../../tools/artifactManager';
import { OnboardingProject } from '../goalBasedOnboardingConsultant';
import crypto from 'crypto';
import { Task } from '../../tools/taskManager';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/helpers';

@StepExecutorDecorator('analyze_goals', 'Break down and analyze business goals into actionable tasks')
export class AnalyzeGoalsExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    private userId: string;

    constructor(
        llmService: LMStudioService,
        private taskManager: TaskManager,
        private artifactManager: ArtifactManager,
        userId: string
    ) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.userId = userId;
    }

    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const analyzedGoals = await this.breakdownBusinessGoals(goal);
        const tasks = await this.createGoalTasks(project, analyzedGoals);
        const businessPlanId = await this.updateProjectBusinessPlan(project);

        return {
            type: 'goals_analysis',
            goals: project.goals,
            projectId: project.id,
            artifactId: businessPlanId
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

    private async breakdownBusinessGoals(userInput: string): Promise<Array<{ description: string }>> {
        const schema = {
            type: "object",
            properties: {
                goals: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            description: { type: "string" }
                        },
                        required: ["description"]
                    }
                }
            },
            required: ["goals"]
        };

        const response = await this.modelHelpers.generate({
            message: userInput,
            instructions: new StructuredOutputPrompt(schema, 
                `Restructure the information the user provided on business goals`)
        });

        return response.goals;
    }

    private async createGoalTasks(project: OnboardingProject, goals: Array<{ description: string }>): Promise<Task[]> {
        const tasks: Task[] = [];
        
        for (const goalData of goals) {
            const task: Task = {
                id: crypto.randomUUID(),
                description: goalData.description,
                creator: this.userId,
                complete: false,
                type: 'business-goal'
            };
            
            await this.taskManager.addTask(project, task);
            tasks.push(task);
        }

        return tasks;
    }

    private async updateProjectBusinessPlan(project: OnboardingProject): Promise<string> {
        const businessPlanId = await this.updateBusinessPlan(project, project.existingPlan);
        
        project.props = {
            ...project.props,
            businessPlanId
        };

        return businessPlanId;
    }

    private async updateBusinessPlan(project: OnboardingProject, existingPlan?: Artifact): Promise<string> {
        const schema = {
            type: "object",
            properties: {
                content: {
                    type: "string",
                    description: "The business plan content in markdown format"
                },
                title: {
                    type: "string",
                    description: "A title for the business plan"
                }
            },
            required: ["content", "title"]
        };

        let existingContent = existingPlan?.content.toString();

        const response = await this.modelHelpers.generate({
            message: JSON.stringify({
                goals: Object.values(project.tasks).filter(t => t.type === 'business-goal'),
                existingPlan: existingContent,
                projectId: project.id,
                latestUpdate: project.props?.latestUpdate || ''
            }),
            instructions: new StructuredOutputPrompt(schema,
                `Update the business plan based on the goals, previous results, and latest updates.
                If there's an existing plan, use it as a base and incorporate new information.`)
        });

        const artifactId = existingPlan?.id || crypto.randomUUID();
        await this.artifactManager.saveArtifact({
            id: artifactId,
            type: 'business-plan',
            content: response.content,
            metadata: {
                title: response.title,
                lastUpdated: new Date().toISOString()
            }
        });

        return artifactId;
    }
}
