import Logger from './logger';

export function setupUnhandledRejectionHandler() {
    process.on('unhandledRejection', (reason, promise) => {
        // Handle Error objects
        if (reason instanceof Error) {
            Logger.error(`Unhandled Promise Rejection: ${reason.message}`, reason);
            
            // Log additional context if available
            const errorContext = (reason as any).context;
            if (errorContext) {
                Logger.error('Error Context:', JSON.stringify(errorContext, null, 2));
            }
        }
        // Handle non-Error rejection reasons
        else {
            Logger.error('Unhandled Promise Rejection:', {
                reason: JSON.stringify(reason, null, 2),
                promise: promise.toString()
            });
        }

        // Get the promise chain stack trace if available
        const promiseStack = (promise as any)._trace || 'No promise chain trace available';
        if (promiseStack) {
            Logger.error('Promise Chain Stack:', promiseStack
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0)
                .join('\n'));
        }
    });
}

// Utility to attach stack traces to promises for better debugging
export function trackPromise<T>(promise: Promise<T>): Promise<T> {
    const stack = new Error().stack;
    (promise as any)._trace = stack;
    return promise;
}
