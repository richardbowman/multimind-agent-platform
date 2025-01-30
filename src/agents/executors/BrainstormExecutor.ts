import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { PromptBuilder, ContentType } from 'src/llm/promptBuilder';
import { BrainstormResponse } from 'src/schemas/BrainstormResponse';
import { StructuredInputPrompt } from 'src/prompts/structuredInputPrompt';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { StructuredOutputPrompt } from 'src/llm/ILLMService';

@StepExecutorDecorator(ExecutorType.BRAINSTORM, 'Generate creative ideas and possibilities through brainstorming', true)
export class BrainstormExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const promptBuilder = this.modelHelpers.createPrompt();
        
        // Add core instructions
        promptBuilder.addInstruction("You are a creative brainstorming assistant.");
        promptBuilder.addInstruction("Generate multiple innovative ideas related to the goal.");
        promptBuilder.addInstruction("For each idea, provide a clear title, description, and potential benefits.");
        promptBuilder.addInstruction("Try not to rule out ideas and focus on being creative.");

        // Add analysis guidelines
        promptBuilder.addInstruction(`After generating ideas, analyze if:
1. We have sufficient diversity of ideas across different approaches
2. We've covered all major aspects of the problem space
3. New ideas are becoming repetitive or less valuable`);

        promptBuilder.addInstruction("Based on this analysis, set isComplete to true if brainstorming should conclude, or false if more ideas are needed. Make sure your message to the user communicates if you want want additional feedback");

        // Add previous results if available
        if (params.previousResult) {
            promptBuilder.addContent(ContentType.STEP_RESULTS, params.previousResult);
        }

        // Add artifacts if available
        if (params.context?.artifacts) {
            promptBuilder.addContent(ContentType.ARTIFACTS_EXCERPTS, params.context?.artifacts);
        }

        // Add execution parameters
        promptBuilder.addContent(ContentType.EXECUTE_PARAMS, {
            goal: params.goal,
            stepGoal: params.stepGoal
        });

        const prompt = promptBuilder.build();
        
        const schema = await getGeneratedSchema(SchemaType.BrainstormResponse);
        const response = await this.modelHelpers.generate<BrainstormResponse>({
            message: params.message || params.stepGoal,
            instructions: new StructuredOutputPrompt(schema, prompt)
        });

        // Parse and format the response
        const ideas = response.ideas || [];
        const formattedIdeas = ideas.map((idea: any) => 
            `### ${idea.title}\n${idea.description}\n\n**Benefits:**\n${idea.benefits}`
        ).join('\n\n');

        return {
            type: "brainstorm",
            finished: response.isComplete || false,
            needsUserInput: !response.isComplete,
            response: {
                message: `**Brainstorming Results:**\n\n${formattedIdeas}\n\n**Summary:**\n${response.summary || ''}`,
                isComplete: response.isComplete || false
            }
        };
    }
}
