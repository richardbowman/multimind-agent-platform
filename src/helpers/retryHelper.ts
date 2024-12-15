import Logger from "./logger";

export class RetryHelper {
    private static readonly MAX_RETRIES = 10;
    private static readonly INITIAL_DELAY_MS = 1000;
    private static readonly MAX_DELAY_MS = 60000;

    static async withRetry<T>(
        operation: () => Promise<T>,
        context: string
    ): Promise<T> {
        let lastError: Error | null = null;
        let delay = this.INITIAL_DELAY_MS;

        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                return await operation();
            } catch (error: any) {
                lastError = error;
                
                if (attempt < this.MAX_RETRIES) {
                    Logger.warn(`${context} - Attempt ${attempt} failed: ${error.message}`);
                    Logger.info(`Retrying in ${delay/1000} seconds...`);
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay = Math.min(delay * 2, this.MAX_DELAY_MS);
                }
            }
        }

        Logger.error(`${context} - All retry attempts failed`);
        throw lastError;
    }
}
