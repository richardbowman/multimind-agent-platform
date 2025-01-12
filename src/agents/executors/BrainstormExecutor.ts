import { StepExecutor, StepResult } from '../stepBasedAgent';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';

@StepExecutorDecorator('brainstorm', 'Generate creative ideas and possibilities through brainstorming')
export class BrainstormExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: ILLMService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async executeOld(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                ideas: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            title: { type: "string" },
                            description: { type: "string" },
                            benefits: { type: "string" }
                        }
                    },
                    description: "List of brainstormed ideas"
                },
                summary: {
                    type: "string",
                    description: "Brief summary connecting the ideas"
                }
            },
            required: ["ideas", "summary"]
        };

        const prompt = `You are a creative brainstorming assistant.
Generate multiple innovative ideas related to the goal.
For each idea, provide a clear title, description, and potential benefits.
Try not to rule out ideas and focus on being creative.

${previousResult ? `Build upon these previous ideas:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate({
            message: goal,
            instructions
        });

        const formattedIdeas = result.ideas.map((idea: any) => 
            `### ${idea.title}\n${idea.description}\n\n**Benefits:**\n${idea.benefits}`
        ).join('\n\n');

        return {
            type: "brainstorm",
            finished: true,
            needsUserInput: true,
            response: {
                message: `**Brainstorming Results:**\n\n${formattedIdeas}\n\n**Summary:**\n${result.summary}`
            }
        };
    }
}
