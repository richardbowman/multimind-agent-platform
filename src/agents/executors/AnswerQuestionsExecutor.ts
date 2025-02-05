import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResult, StepResultType } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { AnswerAnalysisResponse, QAAnswers } from '../../schemas/AnswerAnalysisResponse';
import { TaskManager } from '../../tools/taskManager';
import { OnboardingProject } from '../onboardingConsultant';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/modelHelpers';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { ExecutorType } from '../interfaces/ExecutorType';
import { StepTask } from '../interfaces/ExecuteStepParams';
import { IntakeQuestion } from 'src/schemas/IntakeQuestionsResponse';
import { ContentType, PromptBuilder } from 'src/llm/promptBuilder';

export interface AnswerMetadata {
    index: number;
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
@StepExecutorDecorator(ExecutorType.ANSWER_QUESTIONS, 'Analyze and process user responses to intake questions', true)
export class AnswerQuestionsExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.taskManager = params.taskManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.AnswerAnalysisResponse);

        const project = this.taskManager.getProject(params.projectId) as OnboardingProject;

        // Get both direct questions and template-based questions
        const pastQA = Object.values(project.tasks).filter(t =>
            t.type === "step" &&
            ((t as StepTask).props.stepType === ExecutorType.UNDERSTAND_GOALS ||
            (t as StepTask).props.stepType === ExecutorType.ANSWER_QUESTIONS) &&
            t.complete
        );

        const answers = pastQA.map(t => t.props?.result?.response?.data?.answers).flat().filter(a => a);
        const outstandingQuestions : IntakeQuestion[] = pastQA ? pastQA.map(q => q.props?.result?.response?.data?.outstandingQuestions||[]).flat() : [];


        // Get template sections that need content
        const templateSections = project.template?.sections.filter(s =>
            s.status !== 'complete'
        ) || [];

        if (outstandingQuestions.length === 0 && templateSections.length === 0) {
            return {
                type: 'answer_analysis',
                finished: true,
                replan: ReplanType.Force,
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
        let artifacts = "";
        if (params.context?.artifacts) {
            artifacts += '\n\n' + this.modelHelpers.formatArtifacts(params.context.artifacts);
        }

        const prompt = this.modelHelpers.createPrompt();
        prompt.addContext({contentType: ContentType.ABOUT})
        prompt.addContext({contentType: ContentType.INTENT, params})
        prompt.addInstruction(`OVERALL GOAL: ${params.overallGoal}

Artifacts Attached To This Conversation:
${artifacts}


Here is the current state of our questions and answers:

Previously Answered Questions:
${answers?.map((a: QAAnswers) =>
    `Question: ${a.question}\nAnswer: ${a.answer}\n`
).join('\n') || 'No previous answers'}

Pending Questions to Analyze:
${outstandingQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}

${templateSections.length > 0 ? `
Document Sections Needing Content:
${templateSections.map((s, i) =>
    `${i + 1}. ${s.title} - ${s.description}
    Questions needed: ${s.questions.join(', ')}`
).join('\n')}
` : ''}

Use the "answers" key to provide a JSON array with an item for EACH of the ${outstandingQuestions.length} pending questions that includes:
1. answered: If the question was answered completely and meaningfully
2. analysis: If answered, restate the specific answer from the response
3. extractedAnswer: Analyze the answer quality and completeness.

Additionally, analyze the overall progress and provide:
1. shouldContinue: true if you have enough information to proceed (roughly 75% of questions answered meaningfully), false if we need more answers
2. message: Show the user you're listening by restating what you learned, and explain what you'd still like to know.
`)

        const modelResponse = await this.modelHelpers.generate<AnswerAnalysisResponse>({
            message: params.message || params.stepGoal,
            threadPosts: params.context?.threadPosts,
            instructions: new StructuredOutputPrompt(schema, prompt)
        });

        // Initialize answers array if it doesn't exist
        // if (!project.metadata.answers) {
        //     project.metadata.answers = [];
        // }

        // Update tasks and store answers based on analysis
        let newAnswers : QAAnswers[] = [];
        for (const answer of modelResponse.answers) {
            const question = outstandingQuestions[answer.questionIndex];
            if (question && answer.answered) {
                newAnswers.push({
                    question: question.question,
                    answer: answer.extractedAnswer,
                    analysis: answer.analysis,
                    answeredAt: new Date()
                });

                // If this answer completes a template section, update the document
                // if (project.template && project.documentDraft) {
                //     const relatedSection = project.template.sections.find(s =>
                //         s.questions.includes(answer.questionIndex)
                //     );

                //     if (relatedSection) {
                //         project.documentDraft = project.documentDraft.replace(
                //             relatedSection.placeholder,
                //             answer.extractedAnswer
                //         );
                //         relatedSection.status = 'draft';
                //     }
                // }
            } else if (question) {
                // await this.markIncomplete(question, answer);
            }
        }
        
        const remainingQuestions = outstandingQuestions.filter((q, i) => !newAnswers.map(a => a.index).includes(i));

        // Check if all required sections are complete
            if (project.template) {
            const allRequiredComplete = project.template.requiredSections.every(sectionId => {
                const section = project.template!.sections.find(s => s.id === sectionId);
                return section?.status === 'complete';
            });


            if (allRequiredComplete) {
                // If we're continuing, mark all pending question tasks as complete
                // if (modelResponse.shouldContinue) {
                //     const pendingTasks = Object.values(project.tasks || {})
                //         .filter((t: any) => t.type === 'process-answers' && !t.complete);

                //     for (const task of pendingTasks) {
                //         await this.taskManager.completeTask(task.id);
                //     }
                // }
                return {
                    type: 'answer_analysis',
                    finished: true,
                    replan: ReplanType.Allow,
                    response: {
                        message: modelResponse.message,
                        document: project.documentDraft,
                        data: {
                            answers: newAnswers
                        }
                    }
                };
            }
        }

        // If we're continuing, mark all pending question tasks as complete
        // if (modelResponse.shouldContinue) {
        //     const pendingTasks = Object.values(project.tasks || {})
        //         .filter((t: any) => t.type === 'process-answers' && !t.complete);

        //     for (const task of pendingTasks) {
        //         await this.taskManager.completeTask(task.id);
        //     }
        // }

        return {
            type: 'answer_analysis',
            finished: modelResponse.shouldContinue,
            // needsUserInput: !modelResponse.shouldContinue,
            replan: modelResponse.shouldContinue ? ReplanType.Allow : ReplanType.None,
            response: {
                message: modelResponse.message,
                data: {
                    answers: newAnswers,
                    outstandingQuestions: remainingQuestions
                }
            }
        };
    }

}
