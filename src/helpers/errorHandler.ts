import Logger from './logger';

export function setupUnhandledRejectionHandler() {
    process.on('unhandledRejection', (reason, promise) => {
        Logger.error('Unhandled Promise Rejection:', {
            reason,
            stack: reason instanceof Error ? reason.stack : 'No stack trace available',
            promise: promise.toString()
        });

        // Get the promise chain stack trace if available
        const promiseStack = (promise as any)._trace || 'No promise chain trace available';
        if (promiseStack) {
            Logger.error('Promise Chain Stack:', promiseStack);
        }

        // Log additional context if available
        if (reason instanceof Error) {
            const errorContext = (reason as any).context;
            if (errorContext) {
                Logger.error('Error Context:', errorContext);
            }
        }
    });
}

// Utility to attach stack traces to promises for better debugging
export function trackPromise<T>(promise: Promise<T>): Promise<T> {
    const stack = new Error().stack;
    (promise as any)._trace = stack;
    return promise;
}
