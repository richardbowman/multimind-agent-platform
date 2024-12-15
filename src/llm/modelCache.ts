import crypto from 'crypto';

interface CacheEntry {
    response: any;
    timestamp: number;
}

export class ModelCache {
    private cache: Map<string, CacheEntry>;
    private ttlMs: number;

    constructor(ttlMinutes: number = 60) {
        this.cache = new Map();
        this.ttlMs = ttlMinutes * 60 * 1000;
    }

    private generateKey(instructions: string, context: any): string {
        const data = JSON.stringify({ instructions, context });
        return crypto.createHash('md5').update(data).digest('hex');
    }

    public get(instructions: string, context: any): any | null {
        const key = this.generateKey(instructions, context);
        const entry = this.cache.get(key);
        
        if (!entry) return null;

        // Check if entry has expired
        if (Date.now() - entry.timestamp > this.ttlMs) {
            this.cache.delete(key);
            return null;
        }

        return entry.response;
    }

    public set(instructions: string, context: any, response: any): void {
        const key = this.generateKey(instructions, context);
        this.cache.set(key, {
            response,
            timestamp: Date.now()
        });
    }

    public clear(): void {
        this.cache.clear();
    }
}
