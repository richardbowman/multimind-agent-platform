import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/helpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { VM } from 'vm2';

interface CodeExecutionResponse {
    code: string;
    explanation: string;
    result: any;
}

@StepExecutorDecorator('code-execution', 'Safely execute JavaScript code in a sandboxed environment')
export class CodeExecutorExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private vm: VM;

    constructor(llmService: ILLMService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.vm = new VM({
            timeout: 5000,
            sandbox: {}
        });
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = {
            type: 'object',
            properties: {
                code: {
                    type: 'string',
                    description: 'The JavaScript code to execute'
                },
                explanation: {
                    type: 'string',
                    description: 'Explanation of what the code does'
                }
            },
            required: ['code', 'explanation']
        };

        const prompt = `You are a JavaScript programming expert.
Generate safe JavaScript code to solve the given problem.
Provide clear explanations of what the code does.
DO NOT use any Node.js specific APIs or file system operations.
Only use pure JavaScript that can run in a sandboxed environment.

${previousResult ? `Consider this previous result:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate<CodeExecutionResponse>({
            message: goal,
            instructions
        });

        let executionResult;
        try {
            executionResult = this.vm.run(result.code);
        } catch (error) {
            executionResult = `Error: ${error.message}`;
        }

        result.result = executionResult;

        return {
            type: "code-execution",
            finished: true,
            response: {
                message: `**Code:**\n\`\`\`javascript\n${result.code}\n\`\`\`\n\n**Explanation:**\n${result.explanation}\n\n**Execution Result:**\n\`\`\`\n${JSON.stringify(executionResult, null, 2)}\n\`\`\``,
                data: result
            }
        };
    }
}
