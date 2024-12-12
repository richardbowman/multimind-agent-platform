import { StepExecutor } from "../stepBasedAgent";
import LMStudioService, { StructuredOutputPrompt } from "../../llm/lmstudioService";
import { ModelHelpers } from "../../llm/helpers";

export class GoalConfirmationExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(private lmStudioService: LMStudioService, userId: string) {
        this.modelHelpers = new ModelHelpers(lmStudioService, userId);
    }

    async execute(goal: string, step: string, projectId: string): Promise<any> {
        const schema = {
            type: "object",
            properties: {
                response: {
                    type: "object",
                    properties: {
                        message: {
                            type: "string",
                            description: "A clear restatement of the goal and confirmation of understanding"
                        },
                        understanding: {
                            type: "boolean",
                            description: "Whether the goal is clear and actionable"
                        }
                    },
                    required: ["message", "understanding"]
                }
            },
            required: ["response"]
        };

        const prompt = `As an AI assistant, your task is to:
1. Restate the user's goal in your own words to demonstrate understanding
2. Confirm whether you have enough information to proceed
3. If anything is unclear, specify what additional information you need

Goal to analyze: "${goal}"`;

        const result = await this.modelHelpers.generate({
            message: goal,
            instructions: new StructuredOutputPrompt(schema, prompt)
        });

        return {
            finished: result.response.understanding,
            needsUserInput: !result.response.understanding,
            response: {
                message: result.response.message
            }
        };
    }
}
