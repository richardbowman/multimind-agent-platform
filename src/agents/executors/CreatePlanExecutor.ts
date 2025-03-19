import { ModelHelpers } from '../../llm/modelHelpers';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { ArtifactManager } from '../../tools/artifactManager';
import { TaskManager } from '../../tools/taskManager';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { OnboardingConsultant, OnboardingProject } from '../onboardingConsultant';
import { DocumentPlanResponse } from '../../schemas/DocumentPlanResponse';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ReplanType, StepResponse, StepResult } from '../interfaces/StepResult';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { QAAnswers } from 'src/schemas/AnswerAnalysisResponse';
import { StringUtils } from 'src/utils/StringUtils';
import { ArtifactType } from 'src/tools/artifact';
import { ContentType, OutputType } from 'src/llm/promptBuilder';

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

@StepExecutorDecorator(ExecutorType.CREATE_PLAN, `Create (or revise) a guide for our agents of the user's desired goals (Must have selected a template prior to this step).`)
export class CreatePlanExecutor implements StepExecutor<StepResponse> {
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

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const project = await this.taskManager.getProject(params.projectId) as OnboardingProject;
        
        // Check for template ID in prior step responses and priorResults
        const templateResult = params.previousResponses?.find(r => 
            r.data?.selectedTemplateId
        );
        
        if (templateResult?.data?.selectedTemplateId) {
            const template = this.onboardingConsultant.getTemplateById(templateResult.data?.selectedTemplateId);
            if (template) {
                project.template = template;
            }
        }
        if (!project.template) {
            return {
                type: 'create_revise_plan',
                finished: true,
                replan: ReplanType.Force,
                response: {
                    message: "No template selected. Please select a template first."
                }
            };
        }
        
        // Get all answers related to the template sections
        const answers = this.getAnswersForTemplate(params);

        const schema = await getGeneratedSchema(SchemaType.DocumentPlanResponse);

        const instructions = this.modelHelpers.createPrompt();
        instructions.addContext({contentType: ContentType.ABOUT});
        instructions.addContext({contentType: ContentType.OVERALL_GOAL, goal: params.overallGoal||params.goal});

        instructions.addContext(`Template: ${project.template.name}
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
                `).join('\n')}`);
        instructions.addInstruction(`Create a comprehensive document based on the template and gathered information.
                For each section:
                1. Use the provided answers to populate the content
                2. Maintain the template structure
                3. Ensure all required sections are complete
                4. Add any additional relevant information
                `);
        instructions.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});


        const rawResponse = await this.modelHelpers.generateMessage({
            message: params.stepGoal || params.message,
            threadPosts: params.context?.threadPosts,
            instructions
        });

        const data = StringUtils.extractAndParseJsonBlock<DocumentPlanResponse>(rawResponse.message, schema);
        const message = StringUtils.extractNonCodeContent(rawResponse.message);

        // Update the document draft with the generated content
        let documentContent = project.template.templateContent;
        for (const section of data?.sections??[]) {
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
        const artifact = await this.artifactManager.saveArtifact({
            id: this.taskManager.newProjectId(),
            type: ArtifactType.Document,
            content: documentContent,
            metadata: {
                templateId: project.template.id,
                completedAt: new Date().toISOString(),
                title: project.template.name,
                sections: data?.sections.map(s => ({
                    id: s.id,
                    status: 'complete'
                }))
            }
        });

        return {
            type: 'create_revise_plan',
            finished: true,
            artifactIds: [artifact.id],
            response: {
                message,
                data: {
                    documentContent
                }
            }
        };
    }

    private getAnswersForTemplate(params: ExecuteParams): QAAnswers[] {
        if (!params.previousResponses) return [];
        
        // Return all answers regardless of template association
        return params.previousResponses.map(r => r.data?.answers as QAAnswers[]).flat().filter(a => a?.answer);
    }
}
