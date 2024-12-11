import { StepExecutor, StepResult } from '../stepBasedAgent';
import crypto from 'crypto';
import LMStudioService, { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { SchemaInliner } from '../../helpers/schemaInliner';
import * as schemaJson from "../schemas/schema.json";
const generatedSchemaDef = new SchemaInliner(schemaJson).inlineReferences(schemaJson.definitions);
import { OperationalGuideResponse } from '../schemas/OperationalGuideResponse';
import { updateBusinessPlan } from './businessPlanHelper';
import { TaskManager } from '../../tools/taskManager';
import { ArtifactManager } from '../../tools/artifactManager';
import { OnboardingProject, QuestionAnswer } from '../goalBasedOnboardingConsultant';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/helpers';
import { CreateArtifact } from '../schemas/ModelResponse';

@StepExecutorDecorator('create_revise_plan', `Create (or revise) a guide for our agents of the user's desired business goals.`)
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
                answers,
                // Include answers in the operational guide
                questionsAndAnswers: answers.map(a => ({
                    question: project.tasks[a.questionId]?.description || '',
                    answer: a.answer,
                    category: project.tasks[a.questionId]?.type
                }))
            }),
            instructions: new StructuredOutputPrompt(schema,
                `Create an overview of the user's desired business goals so our project manager, researcher, and content writer agents know how to help.
                Use the provided answers about the business and service requirements to inform the plan.`)
        });

        // Update the business plan with the operational guide
        const agentsGuideId = await this.updateProjectBusinessPlan(project, response);

        // mark all tasks we were able to incorporate as complete
        for (const planTask of businessGoals) {
            this.taskManager.completeTask(planTask.id);
        }

        // Format the response message to include the artifact reference
        const responseMessage = `${response.summary}\n\n---\nI've created a detailed plan (${agentsGuideId}) that outlines the operational strategy. Let me know if you'd like any changes?`;

        return {
            type: 'create_revise_plan',
            finished: true,
            needsUserInput: true,
            response: {
                message: responseMessage,
                artifactId: agentsGuideId,
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
