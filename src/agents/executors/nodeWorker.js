const { parentPort, workerData } = require('worker_threads');

// Make artifacts available globally
global.ARTIFACTS = workerData.artifacts || [];

// Setup console capture
const originalConsole = { ...console };
let capturedOutput = '';

['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
    console[method] = (...args) => {
        capturedOutput += args.join(' ') + '\n';
        originalConsole[method](...args);
    };
});

try {
    // Execute the code
    const result = eval(workerData.code);
    
    // Send console output
    parentPort.postMessage({
        type: 'console',
        data: capturedOutput.trim()
    });

    // Send final result
    parentPort.postMessage({
        type: 'result',
        data: result
    });
} catch (error) {
    parentPort.postMessage({
        type: 'error',
        data: error.message
    });
    process.exit(1);
}
