import Logger from './logger';

export class AsyncQueue {
    private queue: Promise<any> = Promise.resolve();
    private locked = false;
    private waitingCount = 0;

    async enqueue<T>(operation: () => Promise<T>): Promise<T> {
        if (this.locked) {
            this.waitingCount++;
            Logger.info(`AsyncQueue: ${this.waitingCount} operations waiting`);
        }

        while (this.locked) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        this.locked = true;
        if (this.waitingCount > 0) {
            this.waitingCount--;
        }

        try {
            const result = await this.queue.then(operation);
            this.queue = Promise.resolve();
            return result;
        } finally {
            this.locked = false;
            if (this.waitingCount > 0) {
                Logger.info(`AsyncQueue: ${this.waitingCount} operations still waiting`);
            }
        }
    }
}
