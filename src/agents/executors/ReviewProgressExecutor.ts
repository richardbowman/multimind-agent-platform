import { StepExecutor, StepResult } from '../stepBasedAgent';
import LMStudioService, { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { SchemaInliner } from '../../helpers/schemaInliner';
import * as schemaJson from "../schemas/schema.json";
const generatedSchemaDef = new SchemaInliner(schemaJson).inlineReferences(schemaJson.definitions);
import { ReviewProgressResponse } from '../schemas/ReviewProgressResponse';
import { updateBusinessPlan } from './businessPlanHelper';
import { TaskManager } from '../../tools/taskManager';
import { ArtifactManager } from '../../tools/artifactManager';
import { OnboardingProject } from '../goalBasedOnboardingConsultant';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/helpers';

@StepExecutorDecorator('review_progress', 'Review and analyze progress of all tasks and goals')
export class ReviewProgressExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(
        llmService: LMStudioService,
        private taskManager: TaskManager,
        private artifactManager: ArtifactManager
    ) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const tasks = this.taskManager.getAllTasks(projectId);

        const schema = generatedSchemaDef.ReviewProgressResponse;

        const response : ReviewProgressResponse = await this.modelHelpers.generate({
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
        const businessPlanId = await updateBusinessPlan(project, this.modelHelpers, this.artifactManager, project.existingPlan);
        
        project.props = {
            ...project.props,
            businessPlanId
        };

        return businessPlanId;
    }
}
