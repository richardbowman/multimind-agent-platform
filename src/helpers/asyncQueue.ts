export class AsyncQueue {
    private queue: Promise<any> = Promise.resolve();
    private locked = false;

    async enqueue<T>(operation: () => Promise<T>): Promise<T> {
        while (this.locked) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        this.locked = true;

        try {
            const result = await this.queue.then(operation);
            this.queue = Promise.resolve();
            return result;
        } finally {
            this.locked = false;
        }
    }
}
