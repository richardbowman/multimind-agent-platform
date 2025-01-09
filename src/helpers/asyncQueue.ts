import Logger from './logger';

export class AsyncQueue {
    private queue: Promise<any> = Promise.resolve();
    private locked = false;
    private waitingOperations: { stack: string }[] = [];

    async enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const stack = new Error().stack || 'No stack trace available';
        
        if (this.locked) {
            this.waitingOperations.push({ stack });
            Logger.verbose(`AsyncQueue: ${this.waitingOperations.length} operations waiting:\n${this.waitingOperations.map(op => op.stack).join('\n\n')}`);
        }

        while (this.locked) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        this.locked = true;
        if (this.waitingOperations.length > 0) {
            this.waitingOperations = this.waitingOperations.filter(op => op.stack !== stack);
        }

        Logger.verbose(`AsyncQueue executing operation from:\n${stack}`);
        
        try {
            const result = await this.queue.then(operation);
            return result;
        } catch (error) {
            Logger.error(`AsyncQueue operation failed from:\n${stack}\nError:`, error);
            throw error;
        } finally {
            this.queue = Promise.resolve();
            this.locked = false;
            if (this.waitingOperations.length > 0) {
                Logger.verbose(`AsyncQueue: ${this.waitingOperations.length} operations still waiting:\n${this.waitingOperations.map(op => op.stack).join('\n\n')}`);
            }
        }
    }
}
