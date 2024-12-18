import { ExecuteParams, StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { AnswerAnalysisResponse } from '../../schemas/AnswerAnalysisResponse';
import { TaskManager } from '../../tools/taskManager';
import { OnboardingProject } from '../onboardingConsultant';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/modelHelpers';
import { SchemaType } from 'src/schemas/SchemaTypes';

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
import { ExecutorType } from './ExecutorType';

@StepExecutorDecorator(ExecutorType.ANSWER_QUESTIONS, 'Analyze and process user responses to intake questions', false)
export class AnswerQuestionsExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(
        llmService: ILLMService,
        private taskManager: TaskManager
    ) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.AnswerAnalysisResponse);

        const project = this.taskManager.getProject(params.projectId) as OnboardingProject;
        const intakeQuestions = Object.values(project.tasks).filter(t => t.type === 'process-answers' && !t.complete);

        if (intakeQuestions.length === 0) {
            return {
                type: 'answer_analysis',
                finished: true,
                response: {
                    message: "No pending questions to analyze."
                }
            };
        }

        const modelResponse = await this.modelHelpers.generate<AnswerAnalysisResponse>({
            message: params.message||params.stepGoal,
            instructions: new StructuredOutputPrompt(schema,
                `OVERALL GOAL: ${params.overallGoal}
                
                Here is the current state of our questions and answers:

                Previously Answered Questions:
                ${project.metadata.answers?.map(a : QuestionRes => 
                    `Question: ${a.question}\nAnswer: ${a.answer}\n`
                ).join('\n') || 'No previous answers'}

                Pending Questions to Analyze:
                ${intakeQuestions.map((q, i) => `${i+1}. ID ${q.id}: ${q.description}`).join('\n')}
                
                Use the "answers" key to provide a JSON array with an item for EACH of the ${intakeQuestions.length} pending questions that includes:
                1. answered: If the question was answered completely and meaningfully
                2. analysis: If answered, restate the specific answer from the response
                3. extractedAnswer: Analyze the answer quality and completeness.
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
            } else if (task) {
                await this.markIncomplete(task, answer);
            }
        }

        const { responseMessage, shouldContinue } = this.analyzeProgress(project, intakeQuestions, modelResponse);

        return {
            type: 'answer_analysis',
            finished: shouldContinue,
            needsUserInput: !shouldContinue,
            response: {
                message: responseMessage
            }
        };
    }

    private async storeAnswer(project: OnboardingProject, task: any, answer: any) {
        // create an interface for this AI!
        project.metadata.answers.push({
            questionId: answer.questionId,
            question: task.description,
            answer: answer.extractedAnswer,
            analysis: answer.analysis,
            answeredAt: new Date().toISOString()
        });

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

    private analyzeProgress(project: OnboardingProject, intakeQuestions: any[], modelResponse: any) {
        const answeredQuestions = project.metadata.answers?.length || 0;
        const totalQuestions = intakeQuestions.length;
        const minimumQuestionsNeeded = Math.ceil(totalQuestions * 0.75);

        const remainingQuestions = intakeQuestions.filter(q => 
            !q.metadata?.isComplete
        );

        const hasEnoughInformation = answeredQuestions >= minimumQuestionsNeeded;

        let responseMessage = modelResponse.message + "\n\n";
        
        if (remainingQuestions.length > 0) {
            responseMessage += this.formatRemainingQuestions(remainingQuestions, modelResponse);
        }

        responseMessage += this.getProgressMessage(hasEnoughInformation, remainingQuestions.length);

        return {
            responseMessage,
            shouldContinue: hasEnoughInformation && remainingQuestions.length === 0
        };
    }

    private formatRemainingQuestions(remainingQuestions: any[], modelResponse: any): string {
        let message = "I still need more information:\n\n";
        remainingQuestions.forEach(q => {
            // Get the corresponding answer from modelResponse
            const answer = Array.isArray(modelResponse.answers) ? 
                modelResponse.answers.find((a: any) => a.questionId === q.id) : 
                undefined;

            message += `${q.description}\n`;
            
            // Check task metadata instead of answer for partial information
            if (q.metadata?.partialAnswer) {
                message += `Current answer: ${q.metadata.partialAnswer}\n`;
                message += `Additional info needed: ${q.metadata.analysis}\n`;
            } else if (answer?.analysis) {
                message += `Feedback: ${answer.analysis}\n`;
            }
            message += "\n";
        });
        return message;
    }

    private getProgressMessage(hasEnoughInformation: boolean, remainingCount: number): string {
        if (hasEnoughInformation && remainingCount === 0) {
            return "All questions have been answered sufficiently. I'll analyze the information to create a plan.";
        } else if (hasEnoughInformation) {
            return "\nWhile we could proceed with the current information, providing answers to the remaining questions would help create a more detailed plan.";
        } else {
            return "\nPlease provide more detailed answers so I can create an effective plan.";
        }
    }
}
