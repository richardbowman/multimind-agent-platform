import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult, StepResultType } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { AnswerAnalysisResponse } from '../../schemas/AnswerAnalysisResponse';
import { TaskManager } from '../../tools/taskManager';
import { OnboardingProject } from '../onboardingConsultant';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/modelHelpers';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { ExecutorType } from '../interfaces/ExecutorType';
import { StepTask } from '../interfaces/ExecuteStepParams';

export interface AnswerMetadata {
    questionId: string;
    question: string;
    answer: string;
    analysis: string;
    answeredAt: string;
}

/**
 * Executor that analyzes and processes user responses to intake questions.
 * Key capabilities:
 * - Tracks and analyzes responses to a set of onboarding/intake questions
 * - Evaluates answer completeness and quality
 * - Stores validated answers in project metadata
 * - Manages question completion state
 * - Provides intelligent feedback on missing or incomplete answers
 * - Determines when enough information has been gathered (75% threshold)
 * - Generates contextual progress messages and next steps
 */
@StepExecutorDecorator(ExecutorType.ANSWER_QUESTIONS, 'Analyze and process user responses to intake questions', false)
export class AnswerQuestionsExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.taskManager = params.taskManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.AnswerAnalysisResponse);

        const project = this.taskManager.getProject(params.projectId) as OnboardingProject;
        
        // Get both direct questions and template-based questions
        const intakeQuestions = Object.values(project.tasks).filter(t => 
            t.type === "step" && 
            (t as StepTask).props.stepType === ExecutorType.ANSWER_QUESTIONS && 
            !t.complete
        );

        // Get template sections that need content
        const templateSections = project.template?.sections.filter(s => 
            s.status !== 'complete'
        ) || [];

        if (intakeQuestions.length === 0 && templateSections.length === 0) {
            return {
                type: 'answer_analysis',
                finished: true,
                response: {
                    message: "No pending questions to analyze."
                }
            };
        }

        // Initialize document draft if needed
        if (project.template && !project.documentDraft) {
            project.documentDraft = project.template.templateContent;
        }

        // Add artifact context if available
        let artifacts;
        if (params.context?.artifacts) {
            artifacts += '\n\n' + this.modelHelpers.formatArtifacts(params.context.artifacts);
        }

        const modelResponse = await this.modelHelpers.generate<AnswerAnalysisResponse>({
            message: params.message||params.stepGoal,
            instructions: new StructuredOutputPrompt(schema,
                `OVERALL GOAL: ${params.overallGoal}
                
                Artifacts Attached To This Conversation:
                ${artifacts}

                
                Here is the current state of our questions and answers:

                Previously Answered Questions:
                ${project.metadata.answers?.map((a : AnswerMetadata) => 
                    `Question: ${a.question}\nAnswer: ${a.answer}\n`
                ).join('\n') || 'No previous answers'}

                Pending Questions to Analyze:
                ${intakeQuestions.map((q, i) => `${i+1}. ID ${q.id}: ${q.description}`).join('\n')}

                ${templateSections.length > 0 ? `
                Document Sections Needing Content:
                ${templateSections.map((s, i) => 
                    `${i+1}. ${s.title} - ${s.description}
                    Questions needed: ${s.questions.join(', ')}`
                ).join('\n')}
                ` : ''}
                
                Use the "answers" key to provide a JSON array with an item for EACH of the ${intakeQuestions.length} pending questions that includes:
                1. answered: If the question was answered completely and meaningfully
                2. analysis: If answered, restate the specific answer from the response
                3. extractedAnswer: Analyze the answer quality and completeness.

                Additionally, analyze the overall progress and provide:
                1. shouldContinue: true if you have enough information to proceed (roughly 75% of questions answered meaningfully), false if we need more answers
                2. message: Show the user you're listening by restating what you learned, and explain what you'd still like to know.
                `)
        });

        // Initialize answers array if it doesn't exist
        if (!project.metadata.answers) {
            project.metadata.answers = [];
        }

        // Update tasks and store answers based on analysis
        for (const answer of modelResponse.answers) {
            const task = project.tasks[answer.questionId];
            if (task && answer.answered) {
                await this.storeAnswer(project, task, answer);
                await this.taskManager.completeTask(answer.questionId);
                
                // If this answer completes a template section, update the document
                if (project.template && project.documentDraft) {
                    const relatedSection = project.template.sections.find(s => 
                        s.questions.includes(answer.questionId)
                    );
                    
                    if (relatedSection) {
                        project.documentDraft = project.documentDraft.replace(
                            relatedSection.placeholder,
                            answer.extractedAnswer
                        );
                        relatedSection.status = 'draft';
                    }
                }
            } else if (task) {
                await this.markIncomplete(task, answer);
            }
        }

        // Check if all required sections are complete
        if (project.template) {
            const allRequiredComplete = project.template.requiredSections.every(sectionId => {
                const section = project.template!.sections.find(s => s.id === sectionId);
                return section?.status === 'complete';
            });

            if (allRequiredComplete) {
                return {
                    type: 'answer_analysis',
                    finished: true,
                    allowReplan: true,
                    response: {
                        message: "All required sections are complete!",
                        document: project.documentDraft
                    }
                };
            }
        }

        return {
            type: 'answer_analysis',
            finished: modelResponse.shouldContinue,
            needsUserInput: !modelResponse.shouldContinue,
            allowReplan: modelResponse.shouldContinue,
            response: {
                message: modelResponse.message
            }
        };
    }

    private async storeAnswer(project: OnboardingProject, task: any, answer: any) {
        const answerMetadata: AnswerMetadata = {
            questionId: answer.questionId,
            question: task.description,
            answer: answer.extractedAnswer,
            analysis: answer.analysis,
            answeredAt: new Date().toISOString()
        };
        project.metadata.answers.push(answerMetadata);

        task.metadata = {
            ...task.metadata,
            analysis: answer.analysis,
            answer: answer.extractedAnswer,
            answeredAt: new Date().toISOString(),
            isComplete: true
        };
    }

    private async markIncomplete(task: any, answer: any) {
        task.metadata = {
            ...task.metadata,
            analysis: answer.analysis,
            partialAnswer: answer.extractedAnswer,
            needsMoreInfo: true,
            lastAttempt: new Date().toISOString()
        };
    }

}
