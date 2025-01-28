import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { PromptBuilder, ContentType } from 'src/llm/promptBuilder';

@StepExecutorDecorator(ExecutorType.BRAINSTORM, 'Generate creative ideas and possibilities through brainstorming', false)
export class BrainstormExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

    }
    
    private getCreativeDirectorAgent(params: ExecuteParams) {
        return params.agents?.find(a => a.type === 'creative-director');
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

        promptBuilder.addInstruction("Based on this analysis, set isComplete to true if brainstorming should conclude, or false if more ideas are needed.");

        // Add previous results if available
        if (params.previousResult) {
            promptBuilder.addContent(ContentType.STEP_RESULTS, params.previousResult);
        }

        // Add execution parameters
        promptBuilder.addContent(ContentType.EXECUTE_PARAMS, {
            goal: params.goal,
            stepGoal: params.stepGoal
        });

        const prompt = promptBuilder.build();
        const response = await this.modelHelpers.generate({
            message: params.message || params.stepGoal,
            systemPrompt: prompt
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
