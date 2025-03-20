export interface RetryOptions {
    maxRetries?: number;
    initialDelayMs?: number;
    timeoutMs?: number;
    backoffFactor?: number;
    minDelayBetweenTasksMs?: number; // Minimum time between any task executions
}

export class RetryError extends Error {
    retryRequested: boolean = true;    
}

let lastTaskTime = 0;

export async function withRetry<T>(
    fn: (previousResult?: T, previousError?: Error) => Promise<T>|T,
    validate: (result: T) => Promise<boolean>|boolean,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxRetries = 3,
        initialDelayMs = 1000,
        timeoutMs = 10000,
        backoffFactor = 2,
        minDelayBetweenTasksMs = 100
    } = options;

    let retryCount = 0;
    let lastError: Error | null = null;
    let lastResult: T | undefined = undefined;

    while (retryCount < maxRetries) {
        try {
            // Calculate time since last task
            const timeSinceLastTask = Date.now() - lastTaskTime;
            
            // Wait if needed to maintain minimum delay
            if (timeSinceLastTask < minDelayBetweenTasksMs) {
                await new Promise(resolve => 
                    setTimeout(resolve, minDelayBetweenTasksMs - timeSinceLastTask)
                );
            }

            // Execute task and track time
            lastTaskTime = Date.now();
            const result = await Promise.race([
                fn(lastResult, lastError),
                new Promise<T>((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), timeoutMs)
                )
            ]);

            if (await validate(result)) {
                return result;
            }
            
            lastResult = result;
            throw new Error('Validation failed');
        } catch (error) {
            lastError = error as Error;
            retryCount++;
            
            if (retryCount < maxRetries) {
                const delay = initialDelayMs * Math.pow(backoffFactor, retryCount - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new Error('Max retries reached');
}
