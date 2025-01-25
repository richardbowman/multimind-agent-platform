import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResult } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { CodeExecutionResponse } from 'src/schemas/CodeExecutionResponse';
import { ExecutorType } from '../interfaces/ExecutorType';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import path from 'path';

/**
 * Executor that runs Node.js code in a worker thread with limited permissions
 * Key capabilities:
 * - Executes Node.js code in an isolated worker thread
 * - Provides 5 second timeout
 * - Captures console output and return values
 * - Handles both primitive and complex return types
 * - Provides automatic error recovery and retry with AI-generated fixes
 * - Supports console.log capture for debugging
 */
@StepExecutorDecorator(ExecutorType.NODE_EXECUTION, 'Execute Node.js code in a worker thread')
export class NodeExecutorExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
    }

    private async executeInWorker(code: string): Promise<{returnValue: any, consoleOutput: string}> {
        return new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, 'nodeWorker.js'), {
                workerData: { code }
            });

            const timeout = setTimeout(() => {
                worker.terminate();
                reject(new Error('Execution timed out after 5 seconds'));
            }, 5000);

            let consoleOutput = '';

            worker.on('message', (message) => {
                if (message.type === 'console') {
                    consoleOutput += message.data + '\n';
                } else if (message.type === 'result') {
                    clearTimeout(timeout);
                    resolve({
                        returnValue: message.data,
                        consoleOutput: consoleOutput.trim()
                    });
                }
            });

            worker.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });

            worker.on('exit', (code) => {
                if (code !== 0) {
                    clearTimeout(timeout);
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });
        });
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const schema = await getGeneratedSchema(SchemaType.CodeExecutionResponse);

        const prompt = `You are a Node.js programming expert.
Generate Node.js code to solve the given problem.
Provide clear explanations of what the code does.
You can use any core Node.js modules and npm packages that are already installed.
The return value of the last line of your script will be shared as the answer.

Example:
const fs = require('fs');
const files = fs.readdirSync('.');
console.log(\`Found \${files.length} files\`);
files;  // send array of files back as the answer

${params.previousResult ? `Consider this previous result:\n${JSON.stringify(params.previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        let result = await this.modelHelpers.generate<CodeExecutionResponse>({
            message: params.message || params.stepGoal,
            instructions,
            model: "qwen2.5-coder-14b-instruct"
        });

        let executionResult;
        try {
            executionResult = await this.executeInWorker(result.code);
        } catch (error) {
            // If there's an error, try again with error feedback
            const errorPrompt = `${prompt}\n\nThe previous attempt resulted in this error:\n${error.message}\n\nPlease fix the code and try again.`;
            const retryInstructions = new StructuredOutputPrompt(schema, errorPrompt);
            let retryResult = await this.modelHelpers.generate<CodeExecutionResponse>({
                message: params.message || params.stepGoal,
                instructions: retryInstructions,
                model: "qwen2.5-coder-14b-instruct"
            });

            try {
                executionResult = await this.executeInWorker(retryResult.code);
                result = retryResult;
            } catch (retryError) {
                executionResult = {
                    returnValue: `Error: ${retryError.message}`,
                    consoleOutput: ''
                };
            }
        }

        const responseData = {
            ...result,
            executionResult
        };

        return {
            type: "node-execution",
            finished: true,
            response: {
                message: `**Code:**\n\`\`\`javascript\n${result.code}\n\`\`\`\n\n**Explanation:**\n${result.explanation}\n\n**Execution Result:**\n\`\`\`\n${JSON.stringify(executionResult.returnValue, null, 2)}\n\`\`\`${executionResult.consoleOutput ? `\n\n**Console Output:**\n\`\`\`\n${executionResult.consoleOutput}\n\`\`\`\n` : ''}`,
                data: responseData
            }
        };
    }
}
```

2. Now let's create the worker file:

src/agents/executors/nodeWorker.js
```typescript
<<<<<<< SEARCH
