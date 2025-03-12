export interface RetryOptions {
    maxRetries?: number;
    initialDelayMs?: number;
    timeoutMs?: number;
    backoffFactor?: number;
}

export async function withRetry<T>(
    fn: () => Promise<T>,
    validate: (result: T) => Promise<boolean>|boolean,
    options: RetryOptions = {}
): Promise<T> {
    const {
        maxRetries = 3,
        initialDelayMs = 1000,
        timeoutMs = 10000,
        backoffFactor = 2
    } = options;

    let retryCount = 0;
    let lastError: Error | null = null;

    while (retryCount < maxRetries) {
        try {
            const result = await Promise.race([
                fn(),
                new Promise<T>((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), timeoutMs)
                )
            ]);

            if (await validate(result)) {
                return result;
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
