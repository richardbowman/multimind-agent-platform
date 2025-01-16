import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:original-fs';
import { join } from 'path';
import { getDataPath } from 'src/helpers/paths';

export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
}

export class LogReader {
    private logFilePath: string;
    private logCache: LogEntry[] = [];
    private lastModified = 0;
    private cacheSize = 10000; // Keep last 10k entries in memory

    constructor() {
        const today = new Date().toISOString().split('T')[0];
        this.logFilePath = join(getDataPath(), `output-${today}.log`);
        this.initializeCache();
    }

    private initializeCache() {
        if (!existsSync(this.logFilePath)) {
            return;
        }

        try {
            const stats = statSync(this.logFilePath);
            this.lastModified = stats.mtimeMs;
            
            // Read file in reverse from end
            const fd = openSync(this.logFilePath, 'r');
            const chunkSize = 1024 * 1024; // 1MB chunks
            let position = stats.size;
            let buffer = Buffer.alloc(chunkSize);
            let remainingLines = this.cacheSize;
            let partialLine = '';

            while (position > 0 && remainingLines > 0) {
                position = Math.max(0, position - chunkSize);
                const bytesRead = readSync(fd, buffer, 0, chunkSize, position);
                const chunk = buffer.toString('utf8', 0, bytesRead);
                
                // Process lines in reverse order
                const lines = chunk.split('\n').reverse();
                if (partialLine) {
                    lines[0] += partialLine;
                    partialLine = '';
                }

                for (const line of lines) {
                    if (!line.trim()) continue;
                    
                    const match = line.match(/^\[(.*?)\] ([A-Z]+): (.*)/);
                    if (match) {
                        this.logCache.unshift({
                            timestamp: match[1],
                            level: match[2],
                            message: match[3]
                        });
                        remainingLines--;
                    } else if (this.logCache.length > 0) {
                        // Continuation line
                        this.logCache[0].message = line + '\n' + this.logCache[0].message;
                    }
                }

                // Handle partial line at start of chunk
                if (position > 0) {
                    partialLine = lines[lines.length - 1];
                }
            }

            closeSync(fd);
        } catch (error) {
            console.error('Error initializing log cache:', error);
        }
    }

    private checkForUpdates(): boolean {
        try {
            const stats = statSync(this.logFilePath);
            if (stats.mtimeMs > this.lastModified) {
                this.lastModified = stats.mtimeMs;
                return true;
            }
            return false;
        } catch {
            return false;
        }
    }

    private updateCache() {
        if (!this.checkForUpdates()) return;

        try {
            const fd = openSync(this.logFilePath, 'r');
            const stats = statSync(this.logFilePath);
            const position = Math.max(0, stats.size - 1024); // Read last 1KB for new entries
            const buffer = Buffer.alloc(1024);
            const bytesRead = readSync(fd, buffer, 0, 1024, position);
            const newContent = buffer.toString('utf8', 0, bytesRead);

            newContent.split('\n').forEach(line => {
                if (!line.trim()) return;
                
                const match = line.match(/^\[(.*?)\] ([A-Z]+): (.*)/);
                if (match) {
                    this.logCache.push({
                        timestamp: match[1],
                        level: match[2],
                        message: match[3]
                    });
                    
                    // Maintain cache size
                    if (this.logCache.length > this.cacheSize) {
                        this.logCache.shift();
                    }
                } else if (this.logCache.length > 0) {
                    // Continuation line
                    this.logCache[this.logCache.length - 1].message += '\n' + line;
                }
            });

            closeSync(fd);
        } catch (error) {
            console.error('Error updating log cache:', error);
        }
    }

    getLogs(params: {
        limit?: number;
        offset?: number;
        filter?: {
            level?: string[];
            search?: string;
            startTime?: number;
            endTime?: number;
        };
    }): { logs: LogEntry[]; total: number } {
        this.updateCache();

        let filtered = this.logCache;
        
        // Apply filters
        if (params.filter) {
            if (params.filter.level?.length) {
                filtered = filtered.filter(entry => 
                    params.filter!.level!.includes(entry.level)
                );
            }
            if (params.filter.search) {
                const search = params.filter.search.toLowerCase();
                filtered = filtered.filter(entry =>
                    entry.message.toLowerCase().includes(search)
                );
            }
            if (params.filter.startTime) {
                const start = new Date(params.filter.startTime).toISOString();
                filtered = filtered.filter(entry => entry.timestamp >= start);
            }
            if (params.filter.endTime) {
                const end = new Date(params.filter.endTime).toISOString();
                filtered = filtered.filter(entry => entry.timestamp <= end);
            }
        }

        // Apply pagination
        const offset = params.offset || 0;
        const limit = params.limit || 100;
        const paginated = filtered.slice(offset, offset + limit);

        return {
            logs: paginated,
            total: filtered.length
        };
    }
}
