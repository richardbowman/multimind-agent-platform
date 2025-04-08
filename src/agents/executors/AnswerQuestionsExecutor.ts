import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResult } from '../interfaces/StepResult';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { AnswerAnalysisResponse, QAAnswers } from '../../schemas/AnswerAnalysisResponse';
import { TaskManager } from '../../tools/taskManager';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/modelHelpers';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { ExecutorType } from '../interfaces/ExecutorType';
import { StepTask } from '../interfaces/ExecuteStepParams';
import { IntakeQuestion } from 'src/schemas/IntakeQuestionsResponse';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { StringUtils } from 'src/utils/StringUtils';

export interface AnswerMetadata {
    index: number;
    question: string;
    answer: string;
    analysis: string;
    answeredAt: Date;
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
export class AnswerQuestionsExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.AnswerAnalysisResponse);

        const project = await this.taskManager.getProject(params.projectId);

        // Get both direct questions and template-based questions
        const pastQA = Object.values(project.tasks).filter(t =>
            t.type === "step" &&
            ((t as StepTask<StepResponse>).props.stepType === ExecutorType.UNDERSTAND_GOALS ||
                (t as StepTask<StepResponse>).props.stepType === ExecutorType.ANSWER_QUESTIONS) &&
            t.complete
        );

        const answers = pastQA.map(t => t.props?.result?.response?.data?.answers).flat().filter(a => a);
        const outstandingQuestions: IntakeQuestion[] = pastQA ? pastQA.map(q => q.props?.result?.response?.data?.outstandingQuestions || []).flat() : [];


        // Get template sections that need content
        if (outstandingQuestions.length === 0) {
            return {
                finished: true,
                replan: ReplanType.Force,
                response: {
                    message: "No pending questions to analyze."
                }
            };
        }

        const prompt = this.modelHelpers.createPrompt();
        prompt.addContext({ contentType: ContentType.ABOUT })
        prompt.addContext({ contentType: ContentType.INTENT, params })
        prompt.addContext({ contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts });
        prompt.addInstruction(`OVERALL GOAL: ${params.overallGoal}

Here is the current state of our questions and answers:

Previously Answered Questions:
${answers?.map((a: QAAnswers) =>
            `Question: ${a.question}\nAnswer: ${a.answer}\n`
        ).join('\n') || 'No previous answers'}

Pending Questions to Analyze:
${outstandingQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}`)

prompt.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, 
    schema,
    specialInstructions: `Use the "answers" key to provide a JSON array with an item for EACH of the ${outstandingQuestions.length} pending questions that includes:
1. answered: If the question was answered completely and meaningfully
2. analysis: If answered, restate the specific answer from the response
3. extractedAnswer: Analyze the answer quality and completeness.

Additionally, analyze the overall progress and provide:
1. shouldContinue: true if you have enough information to proceed (roughly 75% of questions answered meaningfully), false if we need more answers
2. message: Show the user you're listening by restating what you learned, and explain what you'd still like to know.
`});

        const rawResponse = await this.modelHelpers.generate({
            message: params.message || params.stepGoal,
            threadPosts: params.context?.threadPosts,
            instructions: prompt
        });
        const response = StringUtils.extractAndParseJsonBlock<AnswerAnalysisResponse>(rawResponse.message);
        const message = StringUtils.extractNonCodeContent(rawResponse.message);

        // Update tasks and store answers based on analysis
        const newAnswers: AnswerMetadata[] = [];
        for (const answer of response.answers) {
            const question = outstandingQuestions[answer.questionIndex];
            if (question && answer.answered) {
                newAnswers.push({
                    index: answer.questionIndex,
                    question: question.question,
                    answer: answer.extractedAnswer,
                    analysis: answer.analysis,
                    answeredAt: new Date()
                });
            }
        }

        const remainingQuestions = outstandingQuestions.filter((q, i) => !newAnswers.map(a => a.questionIndex).includes(i));

        // Check if all required sections are complete
        if (remainingQuestions.length === 0) {
            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    message,
                    data: {
                        answers: newAnswers
                    }
                }
            };
        }

        return {
            finished: response.shouldContinue,
            replan: response.shouldContinue ? ReplanType.Allow : ReplanType.None,
            response: {
                message,
                data: {
                    answers: newAnswers,
                    outstandingQuestions: remainingQuestions
                }
            }
        };
    }

}
