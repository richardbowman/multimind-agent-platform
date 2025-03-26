import { Worker } from 'worker_threads';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from '../interfaces/StepResult';
import { ILLMService } from "src/llm/ILLMService";
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import path from 'path';
import { CodeBlock, StringUtils } from 'src/utils/StringUtils';
import { ArtifactManager } from 'src/tools/artifactManager';
import { app } from 'electron';
import { ModelType } from "src/llm/types/ModelType";
import { Artifact } from 'src/tools/artifact';
import { ContentType } from 'src/llm/promptBuilder';
import { UUID } from 'src/types/uuid';
import { ConsoleError } from './ConsoleError';

export interface ArtifactInfo {
    title: string;
    id: UUID;
}

export interface CodeResultData {
    returnValue?: any;
    consoleOutput?: string;
    code?: string;
    error?: string;
    artifacts: ArtifactInfo[];
}

export interface CodeResult extends StepResponse {
    type: StepResponseType.CodeResult;
    data: CodeResultData;
}

export interface WorkerResult {
    returnValue: any;
    consoleOutput: string;
    artifacts: Partial<Artifact>[];
}

/**
 * Executor that runs Node.js code in a worker thread with limited permissions
 * Key capabilities:
 * - Executes Node.js code in an isolated worker thread
 * - Provides 5 minute timeout
 * - Captures console output and return values
 * - Handles both primitive and complex return types
 * - Provides automatic error recovery and retry with AI-generated fixes
 * - Supports console.log capture for debugging
 */
@StepExecutorDecorator(ExecutorType.NODE_EXECUTION, 'Execute Node.js code in a worker thread using provided packages (you may not install)')
export class NodeExecutorExecutor implements StepExecutor<CodeResult> {
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;
    private llmService: ILLMService;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.artifactManager = params.artifactManager;
        this.llmService = params.llmService;
    }

    private renderResult(data: CodeResultData) {
        return `**Code:**
\`\`\`javascript
${data.code}
\`\`\`

${data.returnValue ? `**Execution Result:**
\`\`\`
${StringUtils.truncate(JSON.stringify(data.returnValue, null, 2), 2000)}
\`\`\`` : ''}

${data.error ? `The previous attempt failed. It resulted in this error: ${data.error}` : ""}
        
${data.consoleOutput ? `**Console Output:**
\`\`\`
${StringUtils.truncateWithEllipsis(data.consoleOutput, 2000)}
\`\`\`` : ''}

${data.artifacts ? `The code created ${data.artifacts.length} artifacts:
${data.artifacts.map(a => `- ID [${a.id}] ${a.title}`).join("\n")}` : ""}
`

    };

    private getWorker(): string {
        if (process.versions['electron']) {
            if (app) {
                return path.join(app.getAppPath(), "dist", "nodeWorker.js");
            }
        }
        return path.join(__dirname, "nodeWorker");
    }

    private async executeInWorker(code: string, artifacts: any[] = []): Promise<WorkerResult> {
        const _this = this;
        return new Promise((resolve, reject) => {
            const worker = new Worker(this.getWorker(), {
                workerData: {
                    code,
                    artifacts
                }
            });

            const timeout = setTimeout(() => {
                worker.terminate();
                reject(new Error('Execution timed out after 5 minutes'));
            }, 5 * 60 * 1000);

            let consoleOutput = '';

            worker.on('message', async (message) => {
                if (message.type === 'console') {
                    consoleOutput += message.data + '\n';
                } else if (message.type === 'error') {
                    const error = new ConsoleError(message.data, consoleOutput);
                    clearTimeout(timeout);
                    reject(error);
                } else if (message.type == 'generate') {
                    const response = await _this.modelHelpers.generate({
                        instructions: message.instructions,
                        message: message.message
                    })
                    worker.postMessage({
                        type: 'generateResponse',
                        message: response.message
                    });
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
                const consoleError = new ConsoleError(error.message, consoleOutput);
                consoleError.stack = error.stack;
                clearTimeout(timeout);
                reject(consoleError);
            });

            worker.on('exit', (code) => {
                if (code !== 0) {
                    clearTimeout(timeout);
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
            });
        });
    }

    async execute(params: ExecuteParams): Promise<StepResult<CodeResult>> {
        const schema = await getGeneratedSchema(SchemaType.CodeExecutionResponse);

        const prompt = `You are a Node.js programming step running as part of a broader agent.
Generate JavaScript code to solve the provided step goal.
Provide clear explanations of what the code does. Include frequent logging so you can 
debug and understand the execution steps.

OVERALL GOAL: ${params.overallGoal}

IMPORTANT RULES FOR CODE:

1. You can use core Node.js modules as well as ONLY THE FOLLOWING SPECIFIC packages using a globally provided 'safeRequire' function:
- node-csv: csv-parse/sync, csv-generate, csv-stringify/sync, stream-transform
    const { parse } = safeRequire('csv-parse/sync');
    const { stringify } = safeRequire('csv-stringify/sync');

2. You are running in a web worker thread. The main execution code cannot use a 'return' statement.

3. You do not have real file-system access. The only "files" you can access are artifacts.
You have access to project artifacts through the ARTIFACTS global variable. You can also CREATE NEW ARTIFACTS by pushing to this array.

To create a new artifact:
ARTIFACTS.push({
    type: 'data',    // Type of artifact (e.g. 'csv', 'document', 'webpage')
    content: '...',  // The actual content (string, JSON, etc)
    metadata: {      // Optional metadata
        mimeType: '...', // Optional MIME type (e.g. 'text/plain', 'application/json')
        title: 'My Artifact',
        description: 'Generated from analysis'
    }
});

Common MIME types:
- JSON data: 'application/json'
- Plain text: 'text/plain'
- Markdown: 'text/markdown'
- CSV: 'text/csv'
- HTML: 'text/html'

The ARTIFACTS array contains objects with these properties:
- id: Unique identifier
- type: Type of artifact (${Object.values(ArtifactManager).join(", ")})
- content: The actual content (string, JSON, etc)
- metadata: Additional information about the artifact (sometimes contains a title)

Example artifact/files access:
// Get first artifact
const artifact = ARTIFACTS[0];
console.log(\`Processing artifact: \${artifact.id}\`);
// Use artifact content
const data = JSON.parse(artifact.content);

4. You have access to a global function "generate(message: string, instructions: string): Promise<string>" that allows you to call an LLM to do things like perform content generation, sentiment analysis, and categorization.

5. When the code is finished, it should call the global method "provideResult(...)" with the final result it wants to share. This must be cloneable across web-worker boundary. Do not return large data sets. If you have large data sets, store them as an artifact and return information to confirm like the count.

6. You have access to JSON utilities through the global jsonUtils object:
   - jsonUtils.extractAndParseJsonBlocks(text): Extracts and parses JSON code blocks from text
     Example:
     const jsonData = jsonUtils.extractAndParseJsonBlocks(someText);
     // Returns array of parsed JSON objects from \`\`\`json blocks

7. For CSV files, consider using looser parsing settings:

// Parse looser CSV content using csv-parse if encountering errors
const records = parse(cleanContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,  // Allow quotes in unquoted fields
    relax_column_count: true,  // Handle inconsistent column counts
    bom: true  // Explicitly handle BOM
});

RESPONSE FORMAT: RESPOND WITH THE CODE INSIDE OF A SINGLE ENCLOSED \`\`\`javascript CODE BLOCK.`;

        const promptBuilder = this.modelHelpers.createPrompt();
        promptBuilder.addInstruction(prompt);
        params.context?.artifacts && promptBuilder.addContext({ contentType: ContentType.ARTIFACTS_TITLES, artifacts: params.context?.artifacts, offset: 0})

        //todo: this only needs to get added once (or we need to not associate to registry)
        promptBuilder.registerStepResultRenderer<CodeResult>(StepResponseType.CodeResult, (response: CodeResult) => {
            return this.renderResult(response.data);
        });

        params.previousResponses && promptBuilder.addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses});

        let result = await this.modelHelpers.generate({
            message: params.stepGoal || params.message,
            instructions: promptBuilder,
            modelType: ModelType.ADVANCED_REASONING
        });

        let stepResult: CodeResult, originalCode: CodeBlock | undefined, reasoning: string, newArtifacts;
        try {
            originalCode = StringUtils.extractCodeBlocks(result.message, "javascript")[0];
            if (originalCode === undefined) throw new Error("No code found");

            reasoning = StringUtils.extractNonCodeContent(result.message);

            const { consoleOutput, returnValue, artifacts } = await this.executeInWorker(originalCode.code, params.context?.artifacts);

            // Get original artifact count
            const originalArtifactCount = params.context?.artifacts?.length || 0;

            // Find any new artifacts that were created
            const newArtifacts = artifacts?.slice(originalArtifactCount) || [];
            const savedArtifacts : Artifact[] = [];

            for (const artifact of newArtifacts) {
                if (artifact.content) {
                    savedArtifacts.push(await this.artifactManager.saveArtifact(artifact));
                } else {
                    throw new ConsoleError("Invalid artifact provided with no content", consoleOutput);
                }
            }

            const data : CodeResultData = {
                code: originalCode.code,
                consoleOutput,
                returnValue,
                artifacts: savedArtifacts.map<ArtifactInfo>(a => ({id: a.id, title: a.metadata?.title||"[No title generated]"}))
            }

            return {
                type: StepResultType.CodeGenerationStep,
                finished: true,
                replan: ReplanType.Allow,
                artifactIds: savedArtifacts && savedArtifacts?.map(a => a.id).filter(id => id !== undefined),
                response: {
                    type: StepResponseType.CodeResult,
                    message: this.renderResult(data),
                    data
                }
            };
        } catch (error) {
            const data : CodeResultData = {
                code: originalCode?.code,
                consoleOutput: (error as ConsoleError)?.consoleOutput,
                error: typeof error === "object" ? (error as any)?.message || "[Not provided]" : "[Not an error message]"
            }

            return {
                type: StepResultType.CodeGenerationStep,
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.CodeResult,
                    message: this.renderResult(data),
                    data
                }
            };
        }
    }
}
