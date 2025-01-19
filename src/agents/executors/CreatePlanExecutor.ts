import { ModelHelpers } from '../../llm/modelHelpers';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { ArtifactManager } from '../../tools/artifactManager';
import { Project, TaskManager } from '../../tools/taskManager';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { OnboardingProject, QuestionAnswer } from '../onboardingConsultant';
import { CreateArtifact } from '../../schemas/ModelResponse';
import { DocumentPlanResponse } from '../../schemas/DocumentPlanResponse';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResult } from '../interfaces/StepResult';
import { updateBusinessPlan } from '../../helpers/businessPlanHelper';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ExecutorType } from '../interfaces/ExecutorType';
import { AnswerMetadata } from './AnswerQuestionsExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';

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
    private onboardingConsultant: OnboardingConsultant;

    constructor(params: ExecutorConstructorParams, onboardingConsultant: OnboardingConsultant) {
        this.userId = params.userId || 'executor';
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
        this.artifactManager = params.artifactManager!;
        this.onboardingConsultant = onboardingConsultant;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const project = this.taskManager.getProject(params.projectId) as OnboardingProject;
        
        // Check for template ID in prior step responses and priorResults
        const templateResult = params.previousResult?.find(r => 
            r.templateId
        );
        
        if (templateResult?.templateId) {
            const template = this.onboardingConsultant.getTemplateById(templateResult.templateId);
            if (template) {
                project.template = template;
            }
        }
        if (!project.template) {
            return {
                type: 'create_revise_plan',
                finished: false,
                response: {
                    message: "No template selected. Please select a template first."
                }
            };
        }
        
        // Get all answers related to the template sections
        const answers = this.getAnswersForTemplate(project);

        const schema = await getGeneratedSchema(SchemaType.DocumentPlanResponse);
        const response = await this.modelHelpers.generate<DocumentPlanResponse>({
            message: params.message || params.stepGoal,
            instructions: new StructuredOutputPrompt(schema,
                `OVERALL GOAL: ${params.overallGoal}
                
                Template: ${project.template.name}
                Description: ${project.template.description}

                Available Sections:
                ${project.template.sections.map(s => `
                - ${s.title} (${s.id})
                  ${s.description}
                  Status: ${s.status}
                  Questions: ${s.questions.join(', ')}
                `).join('\n')}

                Gathered Information:
                ${answers.map(a => `
                - ${a.question}
                  ${a.answer}
                `).join('\n')}

                Create a comprehensive document based on the template and gathered information.
                For each section:
                1. Use the provided answers to populate the content
                2. Maintain the template structure
                3. Ensure all required sections are complete
                4. Add any additional relevant information
                `)
        });

        // Update the document draft with the generated content
        let documentContent = project.template.templateContent;
        for (const section of response.sections) {
            documentContent = documentContent.replace(
                `{${section.id}}`, 
                section.content
            );
            
            // Update section status
            const templateSection = project.template.sections.find(s => s.id === section.id);
            if (templateSection) {
                templateSection.status = 'complete';
            }
        }

        // Save the completed document as an artifact
        const artifactId = await this.artifactManager.saveArtifact({
            id: this.taskManager.newProjectId(),
            type: 'document',
            content: documentContent,
            metadata: {
                templateId: project.template.id,
                completedAt: new Date().toISOString(),
                title: project.template.name,
                sections: response.sections.map(s => ({
                    id: s.id,
                    status: 'complete'
                }))
            }
        });

        return {
            type: 'create_revise_plan',
            finished: true,
            response: {
                message: `Document created successfully using template: ${project.template.name}`,
                artifactId,
                documentContent
            }
        };
    }

    private getAnswersForTemplate(project: OnboardingProject): QAItem[] {
        if (!project.metadata.answers) return [];
        
        // Return all answers regardless of template association
        return project.metadata.answers.map(answer => ({
            question: project.tasks[answer.questionId]?.description || '',
            answer: answer.answer,
            category: project.tasks[answer.questionId]?.type
        }));
    }
}
