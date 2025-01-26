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
@StepExecutorDecorator(ExecutorType.NODE_EXECUTION, 'Execute Node.js code in a worker thread using provided packages (you may not install)')
export class NodeExecutorExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
    }

    private async executeInWorker(code: string, artifacts: any[] = []): Promise<{returnValue: any, consoleOutput: string, artifacts: any[]}> {
        return new Promise((resolve, reject) => {
            const worker = new Worker(path.join(__dirname, 'nodeWorker.js'), {
                workerData: { 
                    code,
                    artifacts 
                }
            });

            const timeout = setTimeout(() => {
                worker.terminate();
                reject(new Error('Execution timed out after 5 seconds'));
            }, 5000);

            let consoleOutput = '';

            worker.on('message', (message) => {
                if (message.type === 'console') {
                    consoleOutput += message.data + '\n';
                } else if (message.type === 'error') {
                    clearTimeout(timeout);
                    reject(new Error(message.data));
                } else if (message.type === 'result') {
                    clearTimeout(timeout);
                    resolve({
                        returnValue: message.data.returnValue,
                        consoleOutput: consoleOutput.trim(),
                        artifacts: message.data.artifacts
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
Provide clear explanations of what the code does. Include frequent logging so you can 
debug and understand the execution steps.

IMPORTANT RULES FOR CODE:

1. You can use core Node.js modules as well as ONLY THE FOLLOWING SPECIFIC packages:
- node-csv: csv-parse, csv-generate, csv-stringify, stream-transform

2. You are running in a web worker thread. The main execution code cannot use a 'return' statement.


3. You do not have real file-system access. The only "files" you can access are artifacts.
You have access to project artifacts through the ARTIFACTS global variable. You can also CREATE NEW ARTIFACTS by pushing to this array.

To create a new artifact:
ARTIFACTS.push({
    id: 'unique-id', // Will be auto-generated if omitted
    type: 'data',    // Type of artifact (e.g. 'data', 'report', 'analysis')
    content: '...',  // The actual content (string, JSON, etc)
    metadata: {      // Optional metadata
        title: 'My Artifact',
        description: 'Generated from analysis'
    }
});

The ARTIFACTS array contains objects with these properties:
- id: Unique identifier
- type: Type of artifact (e.g. 'file', 'data', 'image')
- content: The actual content (string, JSON, etc)
- metadata: Additional information about the artifact (sometimes contains a title)

Example artifact/files access:
// Get first artifact
const artifact = ARTIFACTS[0];
console.log(\`Processing artifact: \${artifact.name}\`);
// Use artifact content
const data = JSON.parse(artifact.content);

4. Your code is running as an eval statement, so return value of the last line of your script will be shared as the answer.


${params.previousResult ? `PREVIOUS STEPS:\n${JSON.stringify(params.previousResult, null, 2)}` : ''}`;

        const instructions = new StructuredOutputPrompt(schema, prompt);
        let result = await this.modelHelpers.generate<CodeExecutionResponse>({
            message: params.message || params.stepGoal,
            instructions
        });

        let executionResult;
        try {
            executionResult = await this.executeInWorker(result.code, params.context?.artifacts);
        } catch (error) {
            // If there's an error, try again with error feedback
            const errorPrompt = `${prompt}\n\nThe previous attempt resulted in this error:\n${error.message}\n\nPlease fix the code and try again.`;
            const retryInstructions = new StructuredOutputPrompt(schema, errorPrompt);
            let retryResult = await this.modelHelpers.generate<CodeExecutionResponse>({
                message: params.message || params.stepGoal,
                instructions: retryInstructions
            });

            try {
                executionResult = await this.executeInWorker(retryResult.code, params.context?.artifacts);
                result = retryResult;
            } catch (retryError) {
                executionResult = {
                    returnValue: `Error: ${retryError.message}`,
                    consoleOutput: ''
                };
            }
        }

        // Get original artifact count
        const originalArtifactCount = params.context?.artifacts?.length || 0;
        
        // Find any new artifacts that were created
        const newArtifacts = executionResult.returnValue?.artifacts?.slice(originalArtifactCount) || [];

        const responseData = {
            ...result,
            executionResult,
            newArtifacts
        };

        return {
            type: "node-execution",
            finished: true,
            artifactIds: newArtifacts.map(a => a.id),
            response: {
                message: `**Code:**\n\`\`\`javascript\n${result.code}\n\`\`\`\n\n**Explanation:**\n${result.explanation}\n\n**Execution Result:**\n\`\`\`\n${JSON.stringify(executionResult.returnValue, null, 2)}\n\`\`\`${executionResult.consoleOutput ? `\n\n**Console Output:**\n\`\`\`\n${executionResult.consoleOutput}\n\`\`\`\n` : ''}`,
                data: responseData
            }
        };
    }
}
