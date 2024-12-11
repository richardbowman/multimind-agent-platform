import { StepExecutor, StepResult } from '../stepBasedAgent';
import crypto from 'crypto';
import LMStudioService, { StructuredOutputPrompt } from '../../llm/lmstudioService';
import { TaskManager } from '../../tools/taskManager';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/helpers';

@StepExecutorDecorator('understand_goals', 'Generate focused questions to understand business needs and AI service fit')
export class UnderstandGoalsExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private userId: string;

    constructor(
        llmService: LMStudioService,
        private taskManager: TaskManager,
        userId: string
    ) {
        this.userId = userId;
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                intakeQuestions: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            question: { type: "string" },
                            purpose: { type: "string" }
                        },
                        required: ["question", "purpose"]
                    }
                },
                reasoning: { type: "string" }
            },
            required: ["intakeQuestions", "reasoning"]
        };

        const response = await this.modelHelpers.generate({
            message: goal,
            instructions: new StructuredOutputPrompt(schema,
                `Based on the user's initial business goals, generate focused questions to understand both their business needs and how our AI service fits in.
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

        // Create tasks for each intake question
        for (const q of response.intakeQuestions) {
            await this.taskManager.addTask(projectId, {
                id: crypto.randomUUID(),
                type: 'answer-questions',
                description: `Q: ${q.question}\nPurpose: ${q.purpose}`,
                creator: this.userId,
                complete: false,
                order: 0
            });
        }

        return {
            type: 'intake_questions',
            finished: true,
            needsUserInput: true,
            response: {
                message: `To help me better understand your goals, I have a few questions:\n\n${
                    response.intakeQuestions.map((q, i) => `${i + 1}. ${q.question}`).join('\n\n')
                }\n\nPlease respond to these questions so I can create a more tailored plan.`
            }
        };
    }
}
