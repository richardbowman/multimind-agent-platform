export interface AsyncQueueOptions {
    concurrency?: number;
    timeout?: number;
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

    constructor(options: AsyncQueueOptions = {}) {
        this.concurrency = options.concurrency || 1;
        this.timeout = options.timeout || 0;
    }

    async add<T>(operation: () => Promise<T>): Promise<T> {
        const stack = new Error().stack || 'No stack trace available';
        
        // Add to queue
        const promise = new Promise<T>((resolve, reject) => {
            this.queue.push(this.runOperation(operation, resolve, reject, stack));
        });

        return promise;
    }

    private async runOperation<T>(
        operation: () => Promise<T>,
        resolve: (value: T) => void,
        reject: (reason?: any) => void,
        stack: string
    ): Promise<void> {
        // Wait for an available slot
        while (this.activeCount >= this.concurrency) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        this.activeCount++;
        AsyncQueue.Logger?.verbose(`AsyncQueue executing operation from:\n${stack}`);

        try {
            // Run the operation with timeout if specified
            const result = this.timeout > 0
                ? await Promise.race([
                    operation(),
                    new Promise<T>((_, reject) => 
                        setTimeout(() => reject(new Error('Operation timed out')), this.timeout)
                    )
                ])
                : await operation();
                
            resolve(result);
        } catch (error) {
            AsyncQueue.Logger?.error(`AsyncQueue operation failed from:\n${stack}\nError:`, error);
            reject(error);
        } finally {
            this.activeCount--;
            this.processNext();
        }
    }

    private processNext() {
        if (this.queue.length > 0 && this.activeCount < this.concurrency) {
            const nextOperation = this.queue.shift();
            if (nextOperation) {
                nextOperation();
            }
        }
    }
}
