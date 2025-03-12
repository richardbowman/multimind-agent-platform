export interface AsyncQueueOptions {
    concurrency?: number;
    timeout?: number;
    minDelayBetweenTasksMs?: number; // Minimum time between task executions
}

export class AsyncQueue {
    public static Logger : {
        verbose: Function,
        error: Function
    }|null = null;

    private queue: Promise<any>[] = [];
    private activeCount = 0;
    private concurrency: number;
    private timeout: number;
    private minDelayBetweenTasksMs: number;
    private lastTaskTime = 0;

    constructor(options: AsyncQueueOptions = {}) {
        this.concurrency = options.concurrency || 1;
        this.timeout = options.timeout || 0;
        this.minDelayBetweenTasksMs = options.minDelayBetweenTasksMs || 0;
    }

    async enqueue<T>(operation: () => Promise<T>): Promise<T> {
        const stack = new Error().stack || 'No stack trace available';
        
        return new Promise<T>((resolve, reject) => {
            // Store the operation and its callbacks
            this.queue.push({
                operation,
                resolve,
                reject,
                stack
            });
            this.processNext();
        });
    }

    private async runOperation<T>(item: {
        operation: () => Promise<T>,
        resolve: (value: T) => void,
        reject: (reason?: any) => void,
        stack: string
    }): Promise<void> {
        // Wait for an available slot
        while (this.activeCount >= this.concurrency) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        this.activeCount++;
        this.lastTaskTime = Date.now();
        AsyncQueue.Logger?.verbose(`AsyncQueue executing operation from:\n${item.stack}`);

        // Calculate time since last task
        const timeSinceLastTask = Date.now() - this.lastTaskTime;
        
        // Wait if needed to maintain minimum delay
        if (timeSinceLastTask < this.minDelayBetweenTasksMs) {
            await new Promise(resolve => 
                setTimeout(resolve, this.minDelayBetweenTasksMs - timeSinceLastTask)
            );
        }


        try {
            // Run the operation with timeout if specified
            const result = this.timeout > 0
                ? await Promise.race([
                    item.operation(),
                    new Promise<T>((_, reject) => 
                        setTimeout(() => reject(new Error('Operation timed out')), this.timeout)
                    )
                ])
                : await item.operation();
                
            item.resolve(result);
        } catch (error) {
            AsyncQueue.Logger?.error(`AsyncQueue operation failed from:\n${item.stack}\nError:`, error);
            item.reject(error);
        } finally {
            this.activeCount--;
            this.processNext();
        }
    }

    private processNext() {
        if (this.queue.length > 0 && this.activeCount < this.concurrency) {
            const nextItem = this.queue.shift();
            if (nextItem) {
                this.runOperation(nextItem);
            }
        }
    }
}
