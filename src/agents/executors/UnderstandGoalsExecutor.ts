import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResult, StepResultType } from '../interfaces/StepResult';
import crypto from 'crypto';
import { StructuredOutputPrompt } from "../../llm/ILLMService";
import { TaskManager, TaskType } from '../../tools/taskManager';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/modelHelpers';
import Logger from '../../helpers/logger';
import { IntakeQuestionsResponse } from '../../schemas/IntakeQuestionsResponse';
import { ExecutorType } from '../interfaces/ExecutorType';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { Artifact } from '../../tools/artifact';
import { StepTask } from '../interfaces/ExecuteStepParams';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { StringUtils } from 'src/utils/StringUtils';
import { attr } from 'cheerio/dist/commonjs/api/attributes';
import { response } from 'express';

/**
 * Executor that generates targeted questions to understand user requirements.
 * Key capabilities:
 * - Analyzes business goals and objectives
 * - Generates relevant intake questions
 * - Tracks previous answers to avoid redundancy
 * - Creates follow-up questions for clarity
 * - Manages question ordering and dependencies
 * - Integrates with task management system
 * - Provides question purpose explanations
 * - Maintains conversation context
 * - Ensures comprehensive requirement gathering
 * - Supports iterative question refinement
 */
@StepExecutorDecorator(ExecutorType.UNDERSTAND_GOALS, 'Generate focused questions to understand user goals')
export class UnderstandGoalsExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private userId: string;
    taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.taskManager = params.taskManager!;
        this.userId = params.userId || 'executor';
    }

    private formatMessage(project: any, artifacts?: Artifact[]): string {
        let message = ``;

        // Include existing Q&A if available
        if (project.metadata?.answers?.length > 0) {
            message += `📋 Previously Gathered Information (${project.metadata.answers.length} answers):\n\n`;
            project.metadata.answers.forEach((answer: any, index: number) => {
                message += `${index + 1}. Q: ${answer.question}\n   A: ${answer.answer}\n`;
                if (answer.analysis) {
                    message += `   Analysis: ${answer.analysis}\n`;
                }
                message += '\n';
            });
        }

        // Include any pending questions
        const pendingQuestions = Object.values(project.tasks || {})
            .filter((t: any) => t.type === 'process-answers' && !t.complete);
        
        if (pendingQuestions.length > 0) {
            message += "❓ Currently Pending Questions:\n";
            pendingQuestions.forEach((task: any) => {
                message += `- ${task.description}\n`;
                if (task.metadata?.partialAnswer) {
                    message += `  Partial Answer: ${task.metadata.partialAnswer}\n`;
                    message += `  Needs: ${task.metadata.analysis}\n`;
                }
            });
            message += '\n';
        }

        return message;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const schema = await getGeneratedSchema(SchemaType.IntakeQuestionsResponse);
        
        const project = this.taskManager.getProject(params.projectId);
        
        // const formattedMessage = this.formatMessage(project, params.context?.artifacts);

        const prompt = this.modelHelpers.createPrompt();



        prompt.addInstruction(`In this step of the process, you are reviewing if we have sufficient information to move forward on achieving the goal.
If you would like to think about the problem to start, use <thinking> tags.

Then, once you have decided if you want to more information from the user, respond with
questions to gather the necessary information. If you have enough information to achive the goal,
explain to the user that we'll continue.

Also include in the JSON attributes a concise restatement of the user's goal to confirm understanding.

IMPORTANT: 
- Review any previous answers carefully to avoid redundant questions
- Build upon partial answers to get more specific details
- Focus on areas not yet covered or needing clarification
- Create as few questions as possible to succeed at the goal.
- If you have enough information to proceed, return no questions
- If the user seems frustrated or asks you to move on, return no questions

`)
        
        prompt.addContext({contentType: ContentType.INTENT, params});
        prompt.addContext({contentType: ContentType.ABOUT});
        prompt.addContext({contentType: ContentType.EXECUTE_PARAMS, params});
        prompt.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts});

        prompt.addOutputInstructions(OutputType.JSON_WITH_MESSAGE_AND_REASONING, schema);
        
        const rawMessage = await this.modelHelpers.generate({
            message: params.message || params.stepGoal,
            instructions: prompt,
            threadPosts: params.context?.threadPosts
        });

        const attributes = StringUtils.extractAndParseJsonBlock<IntakeQuestionsResponse>(rawMessage.message, schema);
        const message = StringUtils.extractNonCodeContent(rawMessage.message, ["thinking"]);
        const reasoning = StringUtils.extractXmlBlock(rawMessage.message, "thinking");

        const shouldContinue = params.executionMode === 'task' ? true : attributes?.shouldContinue;

        return {
            finished: true,
            needsUserInput: !shouldContinue,
            replan: shouldContinue ? ReplanType.Allow : ReplanType.None,
            goal: attributes?.goalRestatement,
            response: {
                message: message,
                reasoning: reasoning,
                data: attributes
            }
        };
    }
}
