import { AsyncQueue } from 'src/helpers/asyncQueue';
import { parentPort, workerData } from 'worker_threads';

// import { parse } from 'csv-parse/sync';

interface WorkerMessage {
    type: string;
    message?: any;
    data?: any;
}

interface GenerateResponse {
    type: string;
    data?: {
        returnValue?: any;
        artifacts?: any[];
    };
}

// Make artifacts available globally
(global as any).ARTIFACTS = workerData.artifacts || [];

(global as any).jsonUtils = {
    extractAndParseJsonBlocks: (text: string): any[] => {
        const jsonBlockRegex = /```json[\s\S]*?\n([\s\S]*?)```/g;
        const matches: any[] = [];
        let match;

        while ((match = jsonBlockRegex.exec(text)) !== null) {
            try {
                const jsonString = match[1].trim();
                const parsed = JSON.parse(jsonString);
                matches.push(parsed);
            } catch (error) {
                throw new SyntaxError(`Failed to parse JSON block: ${(error as Error).message}`);
            }
        }

        return matches;
    }
};

// Setup console capture
const originalConsole = { ...console };
let capturedOutput = '';

(global as any).console = {};
['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
    (global as any).console[method] = (...args: any[]) => {
        (originalConsole as any)[method](...args);
        try {
            const formattedArgs = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg?.toString()
            ).join(' ');
            capturedOutput += formattedArgs + '\n';
        } catch (e) {
            originalConsole.error("Error processing logging statement in worker", e);
        }
    };
});

AsyncQueue.Logger = {
    verbose: (...args) => {
        console.log(args);
    },
    error: (...args) => {
        console.error(args);
    }
}

try {
    const generateQueue = new AsyncQueue();

    (global as any).generate = (chatMessage: any, instructions: any) => {
        originalConsole.log("generate request", chatMessage, instructions);
        return generateQueue.enqueue(async () => {
            originalConsole.log("starting queued generator", chatMessage, instructions);
            const response = new Promise((resolve, reject) => {
                parentPort?.once("message", (workerMessage: WorkerMessage) => {
                    originalConsole.log("generate response", workerMessage);
                    if (workerMessage.type === "generateResponse") {
                        originalConsole.log("sending response message", typeof workerMessage.message, workerMessage.message);
                        resolve(workerMessage.message);
                    } else {
                        reject("Unexpected type:" + workerMessage.type);
                    }
                });
            });
            parentPort?.postMessage({
                type: "generate",
                message: chatMessage,
                instructions
            });
            return response;
        });
    };

    (global as any).provideResult = (result: any) => {
        originalConsole.log("provide result called", result);
        parentPort?.postMessage({
            type: "result",
            data: {
                returnValue: result,
                artifacts: (global as any).ARTIFACTS
            }
        });
    };

    // Whitelist allowed modules
    const ALLOWED_MODULE_NAMES = [
        'csv-parse/sync',
        'csv-stringify/sync', 
        'stream-transform',
        'csv-generate'
    ] as const;

    Promise.all(
        ALLOWED_MODULE_NAMES.map(async name => [
            name,
            await import(name)
        ])
    ).then((modules) => {
        const allowedModules = Object.fromEntries(modules);
        const requireWrapper = async (module: string) => {
            if (!ALLOWED_MODULE_NAMES.includes(module as any)) {
                throw new Error(`Module ${module} is not allowed`);
            }
            return allowedModules[module];
        };
    
        (global as any).safeRequire = requireWrapper;
        (global as any).parentPort = {
            postMessage(arg) {
                originalConsole.log("trying postmessage", arg);
                parentPort?.postMessage(arg);
            }
        };
    
        // Execute the code
        const codeToRun = `
            (async () => {
                try {
                    ${(workerData as any).code}
                } catch (error) {
                    originalConsole.log(error);
                    // Send console output before error
                    parentPort?.postMessage({
                        type: 'console',
                        data: capturedOutput.trim()
                    });
                    
                    // Send error with console output
                    parentPort?.postMessage({
                        type: 'error',
                        data: error.message,
                        stack: error.stack
                    });
                }
            })()
        `;
    
        eval(codeToRun);        
    });
} catch (error) {
    // Send console output before error
    parentPort?.postMessage({
        type: 'console',
        data: capturedOutput.trim()
    });

    // Send error with console output
    parentPort?.postMessage({
        type: 'error',
        data: `${(error as Error).message}\n${(error as Error).stack}`
    });
    process.exit(1);
}
