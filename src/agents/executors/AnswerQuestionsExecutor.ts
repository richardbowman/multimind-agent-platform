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
import { ExecutorType } from './ExecutorType';

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
                ${project.metadata.answers?.map((a : AnswerMetadata) => 
                    `Question: ${a.question}\nAnswer: ${a.answer}\n`
                ).join('\n') || 'No previous answers'}

                Pending Questions to Analyze:
                ${intakeQuestions.map((q, i) => `${i+1}. ID ${q.id}: ${q.description}`).join('\n')}
                
                Use the "answers" key to provide a JSON array with an item for EACH of the ${intakeQuestions.length} pending questions that includes:
                1. answered: If the question was answered completely and meaningfully
                2. analysis: If answered, restate the specific answer from the response
                3. extractedAnswer: Analyze the answer quality and completeness.

                Additionally, analyze the overall progress and provide:
                1. shouldContinue: true if we have enough information to proceed (roughly 75% of questions answered meaningfully), false if we need more answers
                2. message: A clear explanation of what information is still needed, or confirmation we can proceed
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

        return {
            type: 'answer_analysis',
            finished: modelResponse.shouldContinue,
            needsUserInput: !modelResponse.shouldContinue,
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
