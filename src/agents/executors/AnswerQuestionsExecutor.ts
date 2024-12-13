import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { ILLMService } from '../../llm/ILLMService';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { AnswerAnalysisResponse } from '../schemas/AnswerAnalysisResponse';
import { TaskManager } from '../../tools/taskManager';
import { OnboardingProject } from '../goalBasedOnboardingConsultant';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/helpers';

@StepExecutorDecorator('process-answers', 'Analyze and process user responses to intake questions')
export class AnswerQuestionsExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(
        llmService: ILLMService,
        private taskManager: TaskManager
    ) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(response: string, step: string, projectId: string): Promise<StepResult> {
        const schema = getGeneratedSchema(SchemaType.AnswerAnalysisResponse);

        const project = this.taskManager.getProject(projectId) as OnboardingProject;
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
            message: response,
            instructions: new StructuredOutputPrompt(schema,
                `Analyze the user's response against these pending questions:
                ${intakeQuestions.map(q => `ID ${q.id}: ${q.description}`).join('\n')}
                
                For each question:
                1. Determine if the question was answered completely and meaningfully
                2. Extract the specific answer from the response (mark as "Not provided" if unclear or incomplete)
                3. Provide a detailed analysis of the answer quality and completeness
                4. Be specific about what information was provided or what's still missing`)
        });

        // Initialize answers array if it doesn't exist
        if (!project.answers) {
            project.answers = [];
        }

        // Update tasks and store answers based on analysis
        for (const answer of modelResponse.answers) {
            const task = project.tasks[answer.questionId];
            if (task && answer.answered) {
                const isAnswerMeaningful = this.validateAnswer(answer);

                if (isAnswerMeaningful) {
                    await this.storeAnswer(project, task, answer);
                    await this.taskManager.completeTask(answer.questionId);
                } else {
                    await this.markIncomplete(task, answer);
                }
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

    private validateAnswer(answer: any): boolean {
        return answer.extractedAnswer.length > 10 && 
            !answer.extractedAnswer.toLowerCase().includes("not provided") &&
            !answer.extractedAnswer.toLowerCase().includes("no answer") &&
            !answer.analysis.toLowerCase().includes("insufficient") &&
            !answer.analysis.toLowerCase().includes("unclear");
    }

    private async storeAnswer(project: OnboardingProject, task: any, answer: any) {
        project.answers.push({
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
        const answeredQuestions = project.answers?.length || 0;
        const totalQuestions = intakeQuestions.length;
        const minimumQuestionsNeeded = Math.ceil(totalQuestions * 0.75);

        const remainingQuestions = intakeQuestions.filter(q => 
            !q.metadata?.isComplete
        );

        const hasEnoughInformation = answeredQuestions >= minimumQuestionsNeeded;

        let responseMessage = modelResponse.summary + "\n\n";
        
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
