import { StepExecutor, StepResult } from '../stepBasedAgent';
import { SchemaInliner } from '../../helpers/schemaInliner';
import * as schemaJson from "../../schemas/schema.json";
import crypto from 'crypto';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { TaskManager } from '../../tools/taskManager';
import { StepExecutorDecorator as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/modelHelpers';
import Logger from 'src/helpers/logger';
import { IntakeQuestionsResponse } from '../../schemas/IntakeQuestionsResponse';
const generatedSchemaDef = new SchemaInliner(schemaJson).inlineReferences(schemaJson.definitions);

@StepExecutorDecorator('understand_goals', 'Generate focused questions to understand business needs and AI service fit')
export class UnderstandGoalsExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private userId: string;

    constructor(
        llmService: ILLMService,
        private taskManager: TaskManager,
        userId: string
    ) {
        this.userId = userId;
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    private formatMessage(goal: string, project: any): string {
        let message = `${goal}\n\n`;

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
        const schema = generatedSchemaDef.IntakeQuestionsResponse;
        const project = this.taskManager.getProject(params.projectId);
        
        const formattedMessage = this.formatMessage(params.goal, project);

        const response : IntakeQuestionsResponse = await this.modelHelpers.generate({
            message: formattedMessage,
            instructions: new StructuredOutputPrompt(schema,
                `Based on the user's initial business goals and any previously gathered information, generate focused questions to understand both their business needs and how our AI service fits in. 
                
                IMPORTANT: 
                - Review any previous answers carefully to avoid redundant questions
                - Build upon partial answers to get more specific details
                - Focus on areas not yet covered or needing clarification
                - If a topic has been partially addressed, ask follow-up questions for deeper understanding
                Each question should help gather specific information about:

                Business Understanding:
                - Their business model and target market
                - Their specific growth objectives and challenges
                - Their competitive advantages
                - Their desired business outcomes
                - Their timeline and budget expectations

                AI Service Integration:
                - Which business processes they want to automate
                - What type of content or tasks they need help with
                - Their team's current workflow and pain points
                - Their experience level with AI tools
                - Their success metrics for AI automation
                
                Include 4-6 essential questions that will help us understand both their business goals and how we can best support them.
                Keep questions focused and actionable.`)
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
                type: 'process-answers',
                description: `Gather answer to Q: ${q.question}; Purpose: ${q.purpose}`,
                creator: this.userId,
                complete: false,
                order: i + 1
            });
        }
        
        // Update existing tasks to continue numbering after the new questions
        for (const task of existingTasks) {
            if (task.order !== undefined) {
                task.order = task.order + response.intakeQuestions.length + 1;
            }
        }

        return {
            type: 'intake_questions',
            finished: true,
            needsUserInput: true,
            response: {
                message: `To help me better understand your goals, I have ${response.intakeQuestions.length} questions:\n\n${
                    response.intakeQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n\n')
                }\n\nPlease respond to these questions so I can create a more tailored plan.`
            }
        };
    }
}
