import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface CacheEntry {
    response: any;
    timestamp: number;
}

export class ModelCache {
    private cache: Map<string, CacheEntry>;
    private ttlMs: number;
    private cacheFile: string;

    constructor(ttlMinutes: number = 60, cacheDir: string = '.cache') {
        this.cache = new Map();
        this.ttlMs = ttlMinutes * 60 * 1000;
        
        // Ensure cache directory exists
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        
        this.cacheFile = path.join(cacheDir, 'model-cache.json');
        this.loadCache();
    }

    private loadCache(): void {
        try {
            if (fs.existsSync(this.cacheFile)) {
                const data = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
                this.cache = new Map(Object.entries(data));
                
                // Clean expired entries during load
                for (const [key, entry] of this.cache.entries()) {
                    if (Date.now() - entry.timestamp > this.ttlMs) {
                        this.cache.delete(key);
                    }
                }
            }
        } catch (error) {
            console.error('Error loading cache:', error);
            this.cache = new Map();
        }
    }

    private saveCache(): void {
        try {
            const data = Object.fromEntries(this.cache);
            fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving cache:', error);
        }
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
        this.saveCache();
    }

    public clear(): void {
        this.cache.clear();
        this.saveCache();
    }
}
