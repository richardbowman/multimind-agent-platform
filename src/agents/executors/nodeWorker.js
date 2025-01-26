const { parentPort, workerData } = require('worker_threads');

// Make artifacts available globally
global.ARTIFACTS = workerData.artifacts || [];

// Setup console capture
const originalConsole = { ...console };
let capturedOutput = '';

['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
    console[method] = (...args) => {
        originalConsole[method](...args);
        try {
            const formattedArgs = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg.toString()
            ).join(' ');
            capturedOutput += formattedArgs + '\n';
        } catch (e) {
            originalConsole.error(e);
        }
    };
});

try {
    // Execute the code
    let result = eval(workerData.code);

    if (result instanceof Promise) {
        result = result.then((result) => {
            // Send console output
            parentPort.postMessage({
                type: 'console',
                data: capturedOutput.trim()
            });

            // Send final result with updated artifacts
            parentPort.postMessage({
                type: 'result',
                data: {
                    returnValue: result,
                    artifacts: global.ARTIFACTS
                }
            });

        }, (err) => {
            // Send console output before error
            parentPort.postMessage({
                type: 'console',
                data: capturedOutput.trim()
            });
            
            // Send error with console output
            parentPort.postMessage({
                type: 'error',
                data: error.message
            });
        })
    } else {
    
        // Send console output
        parentPort.postMessage({
            type: 'console',
            data: capturedOutput.trim()
        });

        // Send final result with updated artifacts
        parentPort.postMessage({
            type: 'result',
            data: {
                returnValue: result,
                artifacts: global.ARTIFACTS
            }
        });
        process.exit(1);
    }
} catch (error) {
    // Send console output before error
    parentPort.postMessage({
        type: 'console',
        data: capturedOutput.trim()
    });
    
    // Send error with console output
    parentPort.postMessage({
        type: 'error',
        data: error.message
    });
    process.exit(1);
}
