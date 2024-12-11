import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from '../../llm/lmstudioService';
import LMStudioService from '../../llm/lmstudioService';
import { ModelHelpers } from 'src/llm/helpers';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';

@StepExecutorDecorator('research', 'Research relevant content from knowledge base')
export class ResearchExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: LMStudioService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search query to find relevant content"
                },
                analysis: {
                    type: "string", 
                    description: "Analysis of the research findings"
                }
            },
            required: ["query", "analysis"]
        };

        const prompt = `You are a content researcher.
Given a content goal, determine the best search query to find relevant information
and analyze the findings to inform content creation.`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate({
            message: goal,
            instructions
        });

        return {
            type: "research",
            finished: true,
            response: {
                message: `**Research Query:**\n\n${result.query}\n\n**Analysis:**\n\n${result.analysis}`
            }
        };
    }
}
