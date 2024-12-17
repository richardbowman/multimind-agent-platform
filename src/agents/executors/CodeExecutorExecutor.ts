import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import ivm from 'isolated-vm';

import { CodeExecutionResponse } from '../../schemas/ModelResponse';
import { codeExecutionSchema } from '../../schemas/CodeExecutionSchema';

@StepExecutorDecorator('code-execution', 'Safely execute JavaScript code in a sandboxed environment')
export class CodeExecutorExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private isolate: ivm.Isolate;

    constructor(llmService: ILLMService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.isolate = new ivm.Isolate({ memoryLimit: 128 }); // Limit to 128MB
    }

    private async executeCodeInSandbox(code: string): Promise<{returnValue: any, consoleOutput?: string}> {
        const context = await this.isolate.createContext();
        const jail = context.global;
        await jail.set('global', jail.derefInto());

        // Set up console logging capture
        let logs: string[] = [];
        const consoleMock = {
            log: function(...args) {
                logs.push(args.map(arg => String(arg)).join(' '));
                return undefined;
            }
        };
        await jail.set('console', new ivm.Reference(consoleMock));
        
        let setResult;
        const resultFn = function(value: any) {
            setResult = String(value);
            return value;
        };
        await jail.set('result', new ivm.Reference(resultFn));
        
        // Create a new script in the context
        const script = await this.isolate.compileScript(code);
        
        // Run with 5 second timeout
        const scriptResult = await script.run(context, { timeout: 5000 });
        
        if (!scriptResult && setResult) {
            scriptResult = setResult;
        }

        // Handle the script result
        let returnValue;
        if (typeof scriptResult === 'number' || 
            typeof scriptResult === 'string' || 
            typeof scriptResult === 'boolean') {
            // Primitive values can be used directly
            returnValue = scriptResult;
        } else {
            try {
                // Try to copy non-primitive values
                returnValue = await scriptResult?.copy();
            } catch (e) {
                // If copy fails, convert to string
                returnValue = scriptResult ? scriptResult.toString() : undefined;
            }
        }
        
        return {
            returnValue: returnValue || (logs.length > 0 ? logs[0] : undefined),
            consoleOutput: logs.join('\n')
        };
    }

    async executeOld(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const schema = codeExecutionSchema;

        const prompt = `You are a JavaScript programming expert.
Generate safe JavaScript code to solve the given problem.
Provide clear explanations of what the code does.
DO NOT use any Node.js specific APIs or file system operations.
Only use pure JavaScript that can run in a sandboxed environment.

To provide the answer, call the "result" function with a string. For instance:

const a = 1 + 2;
result(\`The answer is \$\{a\}\`);

${previousResult ? `Consider this previous result:\n${JSON.stringify(previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const result = await this.modelHelpers.generate<CodeExecutionResponse>({
            message: goal,
            instructions,
            model: "qwen2.5-coder-14b-instruct"
        });

        let executionResult;
        try {
            executionResult = await this.executeCodeInSandbox(result.code);
        } catch (error) {
            // If there's an error, try again with error feedback
            const errorPrompt = `${prompt}\n\nThe previous attempt resulted in this error:\n${error.message}\n\nPlease fix the code and try again.`;
            const retryInstructions = new StructuredOutputPrompt(schema, errorPrompt);
            const retryResult = await this.modelHelpers.generate<CodeExecutionResponse>({
                message: goal,
                instructions: retryInstructions,
                model: "qwen2.5-coder-14b-instruct"
            });

            try {
                executionResult = await this.executeCodeInSandbox(retryResult.code);
                result = retryResult;
            } catch (retryError) {
                executionResult = `Error: ${error.message}\nRetry Error: ${retryError.message}`;
            }
        } finally {
            // Dispose the isolate to free memory
            await this.isolate.dispose();
            // Create a new isolate for next execution
            this.isolate = new ivm.Isolate({ memoryLimit: 128 });
        }

        result.result = executionResult;

        return {
            type: "code-execution",
            finished: true,
            response: {
                message: `**Code:**\n\`\`\`javascript\n${result.code}\n\`\`\`\n\n**Explanation:**\n${result.explanation}\n\n**Execution Result:**\n\`\`\`\n${JSON.stringify(executionResult.returnValue, null, 2)}\n\`\`\`${executionResult.consoleOutput ? `\n\n**Console Output:**\n\`\`\`\n${executionResult.consoleOutput}\n\`\`\`` : ''}`,
                data: result
            }
        };
    }
}
