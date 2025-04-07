import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResponseType, StepResult } from '../interfaces/StepResult';
import { TaskManager } from '../../tools/taskManager';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/modelHelpers';
import { IntakeQuestionsResponse } from '../../schemas/IntakeQuestionsResponse';
import { ExecutorType } from '../interfaces/ExecutorType';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { Artifact } from '../../tools/artifact';
import { ContentType, globalRegistry, OutputType } from 'src/llm/promptBuilder';
import { StringUtils } from 'src/utils/StringUtils';
import { withRetry } from 'src/helpers/retry';

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
@StepExecutorDecorator(ExecutorType.UNDERSTAND_GOALS, 'Assess how well we understand how to proceed')
export class UnderstandGoalsExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private userId: string;
    taskManager: TaskManager;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
        this.userId = params.userId || 'executor';

        globalRegistry.stepResponseRenderers.set(StepResponseType.GoalAssessment, (stepResponse) => 
            stepResponse.data?.shouldContinue ? `RECOMMEND CONTINUING: ${stepResponse.status}` :
                `RECOMMEND AWAITING FURTHER INFORMATION: ${stepResponse.status}`
        );
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
        const prompt = this.startModel(params);

        prompt.addInstruction(`You are a tool called by the agent. MAKE SURE TO FOLLOW THE RESPONSE FORMAT PRECISELY. Provide a status message explaining if we have sufficient information from the user to achieve the goal.

${params.executionMode === 'conversation' ? `Then, once you have decided if you want to more information from the user, respond with the information you would like from the user.` : ""}

Set the "goalRestatement" field to a concise restatement of the user's goal that will be used by
future steps in the agent workflow. 

${params.executionMode === 'conversation' ? `Set the 'shouldContinue' to true telling the workflow whether it should continue, or false if we must await
answers from the user.` : `Set the 'shouldContinue' to false if the workflow should fail because it is not possible to continue.`}
`)
        
        prompt.addContext({contentType: ContentType.INTENT, params});
        prompt.addContext({contentType: ContentType.ABOUT});
        prompt.addContext({contentType: ContentType.EXECUTE_PARAMS, params});
        prompt.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts});

        prompt.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE_AND_REASONING, schema});

        const { rawMessage, attributes, message, reasoning, shouldContinue } = await withRetry(async () => {
            const rawMessage = await prompt.generate({
                message: params.message || params.stepGoal
            });
    
            const attributes = StringUtils.extractAndParseJsonBlock<IntakeQuestionsResponse>(rawMessage.message, schema);
            const message = StringUtils.extractNonCodeContent(rawMessage.message, ["thinking"]);
            const reasoning = StringUtils.extractXmlBlock(rawMessage.message, "thinking");
    
            const shouldContinue = params.executionMode === 'task' ? true : attributes?.shouldContinue;
            return { rawMessage, attributes, message, reasoning, shouldContinue };
        }, () => true);

        return {
            finished: true,
            replan: ReplanType.Allow,
            goal: attributes?.goalRestatement,
            response: {
                type: StepResponseType.GoalAssessment,
                status: message,
                reasoning: reasoning,
                data: attributes
            }
        };
    }
}
    