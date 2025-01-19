import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult, StepResultType } from '../interfaces/StepResult';
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

    private formatMessage(goal: string, project: any, artifacts?: Artifact[]): string {
        let message = `${goal}\n\n`;

        // Include relevant artifacts if available
        if (artifacts && artifacts.length > 0) {
            message += this.modelHelpers.formatArtifacts(artifacts);
        }

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

    async execute(params: ExecuteParams): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.IntakeQuestionsResponse);
        
        const project = this.taskManager.getProject(params.projectId);
        
        const formattedMessage = this.formatMessage(params.goal, project, params.context?.artifacts);

        const response : IntakeQuestionsResponse = await this.modelHelpers.generate({
            message: formattedMessage,
            instructions: new StructuredOutputPrompt(schema,
                `Generate focused questions to achieve the goal: ${params.goal}
                
                IMPORTANT: 
                - Review any previous answers carefully to avoid redundant questions
                - Build upon partial answers to get more specific details
                - Focus on areas not yet covered or needing clarification
                - If a topic has been partially addressed, ask follow-up questions for deeper understanding
                Each question should help gather specific information about:

                Create as few questions as possible to help understand the goals.
                Keep questions focused and actionable. If you have a good understanding, return no more questions.`)
        });

        Logger.info('UnderstandGoalsExecutor response:', JSON.stringify(response, null, 2));

        if (!response.intakeQuestions || !Array.isArray(response.intakeQuestions)) {
            throw new Error(`Invalid response format. Expected array of questions but got: ${JSON.stringify(response)}`);
        }
        
        // Get existing tasks and their current max order
        const existingTasks = this.taskManager.getAllTasks(params.projectId);
        
        // Create tasks for each intake question with sequential ordering starting at 1
        for (let i = 0; i < response.intakeQuestions.length; i++) {
            const q = response.intakeQuestions[i];
            await this.taskManager.addTask(project, {
                id: crypto.randomUUID(),
                type: TaskType.Step,
                props: {
                    stepType: ExecutorType.ANSWER_QUESTIONS,
                },
                category: 'process-answers',
                description: `Gather answer to Q: ${q.question}; Purpose: ${q.purpose}`,
                creator: this.userId,
                complete: false,
                order: i + 1
            } as StepTask);
        }
        
        // Update existing tasks to continue numbering after the new questions
        for (const task of existingTasks) {
            await this.taskManager.updateTask(task.id, {
                order: task.order||0 + response.intakeQuestions.length + 1
            });
        }

        // Generate a restatement of the user's goal
        const goalRestatement = await this.modelHelpers.generate({
            message: formattedMessage,
            instructions: `Please restate the user's goal in your own words to confirm understanding. 
            Keep it concise but include all key elements.`
        });

        return {
            finished: true,
            needsUserInput: true,
            goal: goalRestatement.message, // Add the restated goal to the StepResult
            response: {
                message: `To help me better understand your goals, I have ${response.intakeQuestions.length} questions:\n\n${
                    response.intakeQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n\n')
                }\n\nPlease respond to these questions so I can create a more tailored plan.\n\nHere's my understanding of your goal:\n${goalRestatement.message}`
            }
        };
    }
}
