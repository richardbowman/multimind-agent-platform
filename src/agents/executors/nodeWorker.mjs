import { parentPort, workerData } from 'worker_threads';

// Make artifacts available globally
global.ARTIFACTS = workerData.artifacts || [];

// Example ModelHelpers.generate() usage:
/*
const response = await ModelHelpers.generate<CodeExecutionResponse>({
    message: 'Your task description',
    instructions: new StructuredOutputPrompt(schema, 'Your instructions')
});
*/

// Setup console capture
const originalConsole = { ...console };
let capturedOutput = '';

global.console = {};
['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
    global.console[method] = (...args) => {
        originalConsole[method](...args);
        try {
            const formattedArgs = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg.toString()
            ).join(' ');
            capturedOutput += formattedArgs + '\n';
        } catch (e) {
            originalConsole.error("Error processing logging statement in worker", e);
        }
    };
});


class AsyncQueue {
    queue = Promise.resolve();
    locked = false;
    waitingOperations = [];

    async enqueue(operation) {
        const stack = new Error().stack || 'No stack trace available';
        
        if (this.locked) {
            this.waitingOperations.push({ stack });
            originalConsole.log(`AsyncQueue: ${this.waitingOperations.length} operations waiting:\n${this.waitingOperations.map(op => op.stack).join('\n\n')}`);
        }

        while (this.locked) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        this.locked = true;
        if (this.waitingOperations.length > 0) {
            this.waitingOperations = this.waitingOperations.filter(op => op.stack !== stack);
        }

        originalConsole.log(`AsyncQueue executing operation from:\n${stack}`);
        
        try {
            const result = await this.queue.then(operation);
            return result;
        } catch (error) {
            originalConsole.log(`AsyncQueue operation failed from:\n${stack}\nError:`, error);
            throw error;
        } finally {
            this.queue = Promise.resolve();
            this.locked = false;
            if (this.waitingOperations.length > 0) {
                originalConsole.log(`AsyncQueue: ${this.waitingOperations.length} operations still waiting:\n${this.waitingOperations.map(op => op.stack).join('\n\n')}`);
            }
        }
    }
}

try {
    const generateQueue = new AsyncQueue();
    
    
    global.generate = (chatMessage, instructions) => {
        originalConsole.log("generate request", chatMessage, instructions);
        return generateQueue.enqueue(() => {
            originalConsole.log("starting queued generator", chatMessage, instructions);
            const response = new Promise((resolve, reject) => {
                parentPort.once("message", (workerMessage) => {
                    originalConsole.log("generate response", workerMessage);
                    if (workerMessage.type === "generateResponse") {
                        originalConsole.log("sending response message", typeof workerMessage.message, workerMessage.message);
                        resolve(workerMessage.message);
                    } else {
                        reject("Unexpected type:" + workerMessage.type);
                    }
                    
                });
            });
            parentPort.postMessage({
                type: "generate", 
                message: chatMessage,
                instructions
            });
            return response;
        })
    };

    global.provideResult = (result) => {
        parentPort.postMessage({
            type: "result",
            data: {
                returnValue: result,
                artifacts: ARTIFACTS
            }
        });
    };

    // Execute the code using import() with data URI
    const encodedJs = encodeURIComponent(`
        ${workerData.code}
        export default (async () => {
            try {
                ${workerData.code}
            } catch (error) {
                // Send console output before error
                parentPort.postMessage({
                    type: 'console',
                    data: capturedOutput.trim()
                });
                
                // Send error with console output
                parentPort.postMessage({
                    type: 'error',
                    data: \`\$\{error.message\}\n\$\{error.stack\}\`
                });
            }
        })();
    `);
    
    const dataUri = 'data:text/javascript;charset=utf-8,' + encodedJs;
    
    let result;
    try {
        const module = await import(dataUri);
        result = await module.default();
    } catch (error) {
        // Send console output before error
        parentPort.postMessage({
            type: 'console',
            data: capturedOutput.trim()
        });
        
        // Send error with console output
        parentPort.postMessage({
            type: 'error',
            data: \`\$\{error.message\}\n\$\{error.stack\}\`
        });
    }

    // if (result && typeof result.then === 'function') {
    //     result = result.then((result) => {
    //         originalConsole.log("Node worker promise resulted", result);

    //         // Send console output
    //         parentPort.postMessage({
    //             type: 'console',
    //             data: capturedOutput.trim()
    //         });

    //         // Send final result with updated artifacts
    //         parentPort.postMessage({
    //             type: 'result',
    //             data: {
    //                 returnValue: result,
    //                 artifacts: global.ARTIFACTS
    //             }
    //         });

    //     }, (error) => {
    //         // Send console output before error
    //         parentPort.postMessage({
    //             type: 'console',
    //             data: capturedOutput.trim()
    //         });
            
    //         // Send error with console output
    //         parentPort.postMessage({
    //             type: 'error',
    //             data: error.message
    //         });
    //     })
    // } else {
    
    //     // Send console output
    //     parentPort.postMessage({
    //         type: 'console',
    //         data: capturedOutput.trim()
    //     });

    //     // Send final result with updated artifacts
    //     parentPort.postMessage({
    //         type: 'result',
    //         data: {
    //             returnValue: result,
    //             artifacts: global.ARTIFACTS
    //         }
    //     });
    //     process.exit(1);
    // }
} catch (error) {
    // Send console output before error
    parentPort.postMessage({
        type: 'console',
        data: capturedOutput.trim()
    });
    
    // Send error with console output
    parentPort.postMessage({
        type: 'error',
        data: `${error.message}\n${error.stack}`
    });
    process.exit(1);
}
