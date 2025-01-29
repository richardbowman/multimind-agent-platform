import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:original-fs';
import { join } from 'path';
import { getDataPath } from 'src/helpers/paths';
import Logger from 'src/helpers/logger';
import EventEmitter from 'events';

export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
}

export class LogReader extends EventEmitter {
    private logFilePath: string;
    private logCache: LogEntry[] = [];
    private lastModified = 0;
    private cacheSize = 10000; // Keep last 10k entries in memory
    private updateDebounceTimeout: NodeJS.Timeout | null = null;

    constructor() {
        super();
        const today = new Date().toISOString().split('T')[0];
        this.logFilePath = join(getDataPath(), `output-${today}.log`);
        this.initializeCache();
    }

    private processLogFile(isInitialization: boolean = false) {
        const startTime = Date.now();
        const operation = isInitialization ? 'Initializing' : 'Updating';
        Logger.verbose(`${operation} log cache from ${this.logFilePath}`);

        if (!existsSync(this.logFilePath)) {
            Logger.verbose('Log file does not exist, skipping operation');
            return;
        }

        try {
            const stats = statSync(this.logFilePath);

            // For updates, check if we need to proceed
            if (!isInitialization && !this.checkForUpdates()) {
                Logger.verbose('No updates detected');
                return;
            }

            this.lastModified = stats.mtimeMs;
            Logger.verbose(`Log file size: ${stats.size} bytes, last modified: ${new
Date(this.lastModified).toISOString()}`);

            const fd = openSync(this.logFilePath, 'r');
            const bufferSize = 1024 * 1024; // 1MB buffer
            const buffer = Buffer.alloc(bufferSize);

            // Determine read position based on operation
            const position = isInitialization ? 0 :
                (this.logCache.length > 0 ? Math.max(0, stats.size - bufferSize) : 0);

            let bytesRead = 0;
            let newEntries = 0;
            let continuationLines = 0;
            let partialLine = '';
            let totalLinesProcessed = 0;
            let totalBytesRead = 0;
            let chunkCount = 0;

            while (position + totalBytesRead < stats.size) {
                const chunkStartTime = Date.now();
                const bytesToRead = Math.min(bufferSize, stats.size - (position + totalBytesRead));
                bytesRead = readSync(fd, buffer, 0, bytesToRead, position + totalBytesRead);
                totalBytesRead += bytesRead;
                chunkCount++;

                const chunk = buffer.toString('utf8', 0, bytesRead);
                const lines = chunk.split('\n');

                // Handle partial line from previous chunk
                if (partialLine) {
                    lines[0] = partialLine + lines[0];
                    partialLine = '';
                }

                // If last line doesn't end with newline, it's partial
                if (!chunk.endsWith('\n')) {
                    partialLine = lines.pop() || '';
                }

                // Handle partial line from previous update (only for updates)
                if (!isInitialization && this.logCache.length > 0 && !chunk.startsWith('\n')) {
                    const lastEntry = this.logCache[this.logCache.length - 1];
                    lastEntry.message += lines[0];
                    lines.shift();
                    continuationLines++;
                }

                for (const line of lines) {
                    if (!line.trim()) continue;

                    const match = line.match(/^\[(.*?)\] ([A-Z]+): (.*)/);
                    if (match) {
                        this.logCache.push({
                            timestamp: match[1],
                            level: match[2],
                            message: match[3]
                        });
                        newEntries++;
                        totalLinesProcessed++;

                        // Maintain cache size
                        if (this.logCache.length > this.cacheSize) {
                            this.logCache.shift();
                        }
                    } else if (this.logCache.length > 0) {
                        // Append to previous message if it's a continuation
                        this.logCache[this.logCache.length - 1].message += '\n' + line;
                        continuationLines++;
                    }
                }

                Logger.verbose(`Processed chunk ${chunkCount} in ${Date.now() - chunkStartTime}ms - Position: ${position + totalBytesRead}, Lines: ${totalLinesProcessed}, Bytes: ${totalBytesRead}`);

                // For updates, we only need to process the last chunk
                if (!isInitialization) break;
            }

            closeSync(fd);
            Logger.verbose(`${operation} completed in ${Date.now() - startTime}ms - New entries: ${newEntries},
Continuations: ${continuationLines}, Total lines: ${totalLinesProcessed}, Total bytes: ${totalBytesRead}, Cache size:
${this.logCache.length}`);

            // Emit update event with debounce (only for updates)
            if (!isInitialization && (newEntries > 0 || continuationLines > 0)) {
                if (this.updateDebounceTimeout) {
                    clearTimeout(this.updateDebounceTimeout);
                }
                this.updateDebounceTimeout = setTimeout(() => {
                    this.emit('update', {
                        newEntries,
                        continuationLines,
                        totalEntries: this.logCache.length
                    });
                }, 500); // Debounce for 500ms
            }
        } catch (error) {
            Logger.error(`Error during ${operation.toLowerCase()} log cache:`, error);
        }
    }

    private initializeCache() {
        this.processLogFile(true);
    }

    private updateCache() {
        this.processLogFile(false);
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
        const startTime = Date.now();
        Logger.verbose('Starting getLogs request');
        
        // Force full refresh if needed
        this.updateCache();

        let filtered = [...this.logCache.reverse()];
        let filterTime = 0;
        let paginationTime = 0;
        
        // Apply filters
        if (params.filter) {
            const filterStart = Date.now();
            
            if (params.filter.level?.length) {
                filtered = filtered.filter(entry => 
                    params.filter!.level!.includes(entry.level)
                );
            }
            
            if (!params.filter.showVerbose) {
                filtered = filtered.filter(entry =>
                    entry.level.toLowerCase() !== 'verbose'
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
            
            filterTime = Date.now() - filterStart;
            Logger.verbose(`Applied filters in ${filterTime}ms - Remaining entries: ${filtered.length}`);
        }

        // Apply pagination
        const paginationStart = Date.now();
        const offset = params.offset || 0;
        const limit = params.limit || 100;
        // Get the requested page of logs (already in reverse order)
        const paginated = filtered.slice(offset, offset + limit);
        paginationTime = Date.now() - paginationStart;

        Logger.verbose(`Processed getLogs in ${Date.now() - startTime}ms (Filter: ${filterTime}ms, Pagination: ${paginationTime}ms) - Returning ${paginated.length} of ${filtered.length} entries`);

        return {
            logs: paginated,
            total: filtered.length
        };
    }
}
