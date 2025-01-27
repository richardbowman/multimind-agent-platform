export class AsyncQueue {
    public static Logger : {
        verbose: Function,
        error: Function
    }|null = null;

    private queue: Promise<any> = Promise.resolve();
    private locked = false;
    private waitingOperations: { stack: string }[] = [];

    async enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const stack = new Error().stack || 'No stack trace available';
        
        if (this.locked) {
            this.waitingOperations.push({ stack });
            AsyncQueue.Logger?.verbose(`AsyncQueue: ${this.waitingOperations.length} operations waiting:\n${this.waitingOperations.map(op => op.stack).join('\n\n')}`);
        }

        while (this.locked) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        this.locked = true;
        if (this.waitingOperations.length > 0) {
            this.waitingOperations = this.waitingOperations.filter(op => op.stack !== stack);
        }

        AsyncQueue.Logger?.verbose(`AsyncQueue executing operation from:\n${stack}`);
        
        try {
            const result = await this.queue.then(operation);
            return result;
        } catch (error) {
            AsyncQueue.Logger?.error(`AsyncQueue operation failed from:\n${stack}\nError:`, error);
            throw error;
        } finally {
            this.queue = Promise.resolve();
            this.locked = false;
            if (this.waitingOperations.length > 0) {
                AsyncQueue.Logger?.verbose(`AsyncQueue: ${this.waitingOperations.length} operations still waiting:\n${this.waitingOperations.map(op => op.stack).join('\n\n')}`);
            }
        }
    }
}
