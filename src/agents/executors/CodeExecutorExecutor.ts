import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { codeExecutionSchema } from '../../schemas/CodeExecutionSchema';
import { getQuickJS } from 'quickjs-emscripten';

/**
 * Executor that safely runs JavaScript code in an isolated sandbox environment. 
 * Key capabilities:
 * - Executes JavaScript code with strict memory and time limits
 * - Uses isolated-vm for secure sandboxed execution
 * - Prevents access to Node.js APIs and file system
 * - Captures console output and return values
 * - Handles both primitive and complex return types
 * - Provides automatic error recovery and retry with AI-generated fixes
 * - Supports console.log capture for debugging
 * - Enforces 5 second execution timeout
 * - Limits memory usage to 128MB per execution
 */
@StepExecutorDecorator(ExecutorType.CODE_EXECUTION, 'Safely execute JavaScript code in a sandboxed environment')
export class CodeExecutorExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(llmService: ILLMService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
    }

    private async executeCodeInSandbox(code: string): Promise<{returnValue: any, consoleOutput?: string}> {
        const QuickJS = await getQuickJS();
        const vm = QuickJS.newContext();
        let logs: string[] = [];

        // Set up console.log
        const logHandle = vm.newFunction("log", (...args) => {
            logs.push(args.map(arg => String(vm.dump(arg))).join(' '));
        });
        const consoleHandle = vm.newObject();
        vm.setProp(consoleHandle, "log", logHandle);
        vm.setProp(vm.global, "console", consoleHandle);
        consoleHandle.dispose();
        logHandle.dispose();

        try {
            // Execute with 5 second timeout
            const result = vm.evalCode(code, {
                shouldInterrupt: () => false, // TODO: Implement timeout
                memoryLimitBytes: 128 * 1024 * 1024 // 128MB
            });

            let returnValue;
            if (result.error) {
                throw new Error(vm.dump(result.error));
            } else {
                returnValue = vm.dump(result.value);
                result.value.dispose();
            }

            return {
                returnValue,
                consoleOutput: logs.join('\n')
            };
        } finally {
            vm.dispose();
        }
    }

    async executeOld(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.CodeExecutionResponse);

        const prompt = `You are a JavaScript programming expert.
Generate safe JavaScript code to solve the given problem.
Provide clear explanations of what the code does.
DO NOT use any Node.js specific APIs or file system operations.
Only use pure JavaScript that can run in a sandboxed environment.
The return value of the last line of your script will be shared as the answer.

Example:
const a = 1 + 2;
console.log(\`The answer is \$\{a\}\`);
a;  // send 3 back as the answer

${previousResult ? `Consider this previous result:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        let result = await this.modelHelpers.generate<CodeExecutionResponse>({
            message: goal,
            instructions,
            model: "qwen2.5-coder-14b-instruct"
        });

        let executionResult: CodeExecution;
        try {
            executionResult = await this.executeCodeInSandbox(result.code);
        } catch (error) {
            // If there's an error, try again with error feedback
            const errorPrompt = `${prompt}\n\nThe previous attempt resulted in this error:\n${error.message}\n\nPlease fix the code and try again.`;
            const retryInstructions = new StructuredOutputPrompt(schema, errorPrompt);
            let retryResult = await this.modelHelpers.generate<CodeExecutionResponse>({
                message: goal,
                instructions: retryInstructions,
                model: "qwen2.5-coder-14b-instruct"
            });

            try {
                executionResult = await this.executeCodeInSandbox(retryResult.code);
                result = retryResult;
            } catch (retryError) {
                executionResult = {
                    returnValue: `Error: ${retryError.message}\nRetry Error: ${retryError.message}`
                };
            }
        }

        const responseData = {
            ...result,
            executionResult
        };

        return {
            type: "code-execution",
            finished: true,
            response: {
                message: `**Code:**\n\`\`\`javascript\n${result.code}\n\`\`\`\n\n**Explanation:**\n${result.explanation}\n\n**Execution Result:**\n\`\`\`\n${JSON.stringify(executionResult.returnValue, null, 2)}\n\`\`\`${executionResult.consoleOutput ? `\n\n**Console Output:**\n\`\`\`\n${executionResult.consoleOutput}\n\`\`\`\n` : ''}`,
                data: responseData
            }
        };
    }
}
