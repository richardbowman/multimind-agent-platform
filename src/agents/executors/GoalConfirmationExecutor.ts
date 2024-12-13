import { StepExecutor } from "../stepBasedAgent";
import { StructuredOutputPrompt } from "../../llm/lmstudioService";
import { ModelHelpers } from "../../llm/helpers";
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { GoalConfirmationResponse } from "../../schemas/goalConfirmation";
import { getGeneratedSchema } from "../../helpers/schemaUtils";
import { SchemaType } from "../../schemas/SchemaTypes";
import { ILLMService } from "../../llm/ILLMService";

@StepExecutorDecorator('goal_confirmation', 'Confirm the goals of the user.')
export class GoalConfirmationExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(private llmService: ILLMService, userId: string) {
        this.modelHelpers = new ModelHelpers(llmService, userId);
    }

    async execute(goal: string, step: string, projectId: string): Promise<any> {
        const schema = getGeneratedSchema(SchemaType.GoalConfirmation);

        const prompt = `As an AI assistant, your task is to:
1. Restate the user's goal in your own words to demonstrate understanding
2. Confirm whether you have enough information to proceed
3. If anything is unclear, specify what additional information you need

Goal to analyze: "${goal}"`;

        const result = await this.modelHelpers.generate<{ response: GoalConfirmationResponse }>({
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
