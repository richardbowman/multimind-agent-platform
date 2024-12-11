import { StepExecutor, StepResult } from '../stepBasedAgent';
import { ModelResponse } from '../schemas/ModelResponse';
import { StructuredOutputPrompt } from '../../llm/lmstudioService';
import LMStudioService from '../../llm/lmstudioService';

export class RefutingExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: LMStudioService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        const schema = {
            type: "object",
            properties: {
                counterarguments: {
                    type: "array",
                    items: {
                        type: "string"
                    },
                    description: "List of potential counterarguments"
                },
                analysis: {
                    type: "string",
                    description: "Analysis of the counterarguments"
                },
                finalVerdict: {
                    type: "string",
                    description: "Final verdict after considering counterarguments"
                }
            },
            required: ["counterarguments", "analysis", "finalVerdict"]
        };

        const prompt = `You are a critical thinker tasked with finding potential flaws in an argument or conclusion.
Consider possible counterarguments and evaluate their validity.
Provide a balanced analysis and final verdict.`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate({
            message: goal,
            instructions
        });

        const counterargumentsList = result.counterarguments
            .map((arg: string) => `- ${arg}`).join('\n');

        return {
            type: "refuting",
            finished: true,
            response: {
                message: `**Potential Counterarguments:**\n${counterargumentsList}\n\n**Analysis:**\n${result.analysis}\n\n**Final Verdict:**\n${result.finalVerdict}`
            }
        };
    }
}
