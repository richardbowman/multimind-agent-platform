import { asError } from "src/types/types";

export interface RetryOptions {
    maxAttempts?: number;
    initialDelayMs?: number;
    timeoutMs?: number;
    backoffFactor?: number;
    minDelayBetweenTasksMs?: number; // Minimum time between any task executions
}

export class RetryError extends Error {
    retryRequested: boolean = true;    
}

let lastTaskTime = 0;

export interface RetryFunctionParams<T> {
    previousResult?: T;
    previousError?: Error;
}

export async function withRetry<T>(
    fn: (params: RetryFunctionParams<T>) => Promise<T>|T,
    validate: (result: T) => Promise<boolean>|boolean,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxAttempts: maxRetries = 3,
        initialDelayMs = 1000,
        timeoutMs = 180000,
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
                fn({ previousResult: lastResult, previousError: lastError }),
                new Promise<T>((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), timeoutMs)
                )
            ]);

            try {
                if (await validate(result)) {
                    return result;
                }    
            } catch (error) {
                throw new Error(`Validation failed: ${asError(error).message}`);
            } finally {
                lastResult = result;
            }
            
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
