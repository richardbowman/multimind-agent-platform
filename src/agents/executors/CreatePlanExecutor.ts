import { ModelHelpers } from '../../llm/modelHelpers';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { ArtifactManager } from '../../tools/artifactManager';
import { Project, TaskManager } from '../../tools/taskManager';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { OnboardingProject, QuestionAnswer } from '../onboardingConsultant';
import { CreateArtifact } from '../../schemas/ModelResponse';
import { OperationalGuideResponse, QAItem } from '../../schemas/OperationalGuideResponse';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResult } from '../interfaces/StepResult';
import { updateBusinessPlan } from '../../helpers/businessPlanHelper';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ExecutorType } from '../interfaces/ExecutorType';
import { AnswerMetadata } from './AnswerQuestionsExecutor';

/**
 * Executor that creates and revises operational business guides based on user requirements.
 * Key capabilities:
 * - Synthesizes business plans from user responses and goals
 * - Maintains version history of plan revisions
 * - Integrates answers from intake questionnaires
 * - Categorizes and prioritizes business objectives
 * - Generates actionable implementation steps
 * - Updates existing plans while preserving context
 * - Creates structured guides for other agent consumption
 * - Manages artifact storage and retrieval
 * - Tracks task completion and dependencies
 */

@StepExecutorDecorator(ExecutorType.CREATE_PLAN, `Create (or revise) a guide for our agents of the user's desired business goals.`)
export class CreatePlanExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private userId: string;
    taskManager: TaskManager;
    artifactManager: ArtifactManager;

    constructor(params: ExecutorConstructorParams) {
        this.userId = params.userId || 'executor';
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
        this.artifactManager = params.artifactManager!;
    }

    async executeOld(goal: string, step: string, projectId: string): Promise<StepResult> {
        const project = await this.getProjectWithPlan(projectId);
        const businessGoals = Object.values(project.tasks).filter(t => t.category === 'create-plan');

        const answers = this.getAnswersForType(project, 'process-answers');

        const formattedMessage = this.formatPromptMessage(
            businessGoals,
            project.existingPlan?.content.toString(),
            project.props||{},
            answers.map(a => ({
                question: project.tasks[a.questionId]?.description || '',
                answer: a.answer,
                category: project.tasks[a.questionId]?.type
            }))
        );

        const schema = await getGeneratedSchema(SchemaType.OperationalGuideResponse);
        const response = await this.modelHelpers.generate<OperationalGuideResponse>({
            message: formattedMessage,
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

    private getAnswersForType(project: Project, questionType: string): QuestionAnswer[] {
        if (!project.metadata.answers) return [];
        
        return project.metadata.answers.filter((answer : AnswerMetadata) => {
            const task = project.tasks[answer.questionId];
            return task?.category === questionType;
        });
    }

    private formatPromptMessage(
        businessGoals: any[],
        currentPlan: string | undefined,
        projectContext: any,
        questionsAndAnswers: QAItem[]
    ): string {
        let message = "I need you to create a comprehensive operational guide based on the following information:\n\n";

        // Add business goals section
        message += "🎯 Business Goals:\n";
        businessGoals.forEach(goal => {
            message += `- ${goal.description}\n`;
        });
        message += "\n";

        // Add Q&A section
        if (questionsAndAnswers.length > 0) {
            message += "📋 Gathered Information:\n";
            questionsAndAnswers.forEach(qa => {
                message += `Q: ${qa.question}\nA: ${qa.answer}\n`;
                if (qa.category) {
                    message += `Category: ${qa.category}\n`;
                }
                message += "\n";
            });
        }

        // Add existing plan context if available
        if (currentPlan) {
            message += "📑 Current Plan Context:\n";
            message += currentPlan + "\n\n";
        }

        // Add project context if relevant
        if (Object.keys(projectContext).length > 0) {
            message += "🔍 Additional Context:\n";
            Object.entries(projectContext).forEach(([key, value]) => {
                if (key !== 'businessPlanId') { // Skip technical fields
                    message += `${key}: ${value}\n`;
                }
            });
            message += "\n";
        }

        return message;
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
