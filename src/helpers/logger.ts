// logger.ts
import { promises as fs, mkdirSync } from 'fs';
import { join } from 'path';
import * as path from 'path';
import { getDataPath } from './paths';
import { Socket } from 'socket.io';
import EventEmitter from 'events';
import { LogReader } from 'src/server/LogReader';
import { LogEntry } from '@langchain/core/dist/tracers/log_stream';

declare global {
    var socket: Socket | undefined;
}

export class LogManager extends EventEmitter implements LogReader {
    private logFilePath = path.join(getDataPath(), `output-${new Date().toISOString().split('T')[0]}.jsonl`);
    private logCache: LogEntry[] = [];
    private cacheSize = 10000;
    private writeQueue: LogEntry[] = [];
    private isWriting = false;
    private writeDebounce: NodeJS.Timeout | null = null;

    private ensureLogDirectoryExists(): void {
        const dir = path.dirname(Logger.logFilePath);
        mkdirSync(dir, { recursive: true });
    }

    private addToCache(entry: LogEntry) {
        // Add new entries to beginning of array to maintain reverse chronological order
        this.logCache.unshift(entry);
        // Keep only the most recent entries
        if (this.logCache.length > this.cacheSize) {
            this.logCache.pop();
        }
    }

    log(level: string, message: string, details?: Record<string, any>): void {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp: new Date().getTime(),
            level: level.toUpperCase(),
            message,
            details,
            isoTime: timestamp
        };

        // Ensure directory exists and append to log file
        if (level !== "progress") {
            this.addToCache(logEntry);
            this.queueWrite(logEntry);
        }

        // Send to WebSocket if connected
        if (global.socket) {
            global.socket.emit('system_log', logEntry);
        }
        this.emit("_" + level.toLowerCase(), logEntry);
        
        if (level === "error" || level === "warn") console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`)
    }

    public info(message: string, error?: any): void {
        const infoMsg = error?.message 
            ? `${message}\nError: ${error.message}\nStack: ${error.stack}`
            : message;
        this.log('info', infoMsg);
    }

    public warn(message: string, error?: any): void {
        const warnMsg = error ?.message
            ? `${message}\nError: ${error.message}\nStack: ${error.stack}`
            : message;
        this.log('warn', warnMsg);
    }

    public debug(message: string, error?: any): void {
        const warnMsg = error ?.message
            ? `${message}\nError: ${error.message}\nStack: ${error.stack}`
            : message;
        this.log('debug', warnMsg);
    }

    public verbose(message: string, error?: any): void {
        const verboseMsg = error?.message 
            ? `${message}\nError: ${error.message}\nStack: ${error.stack}`
            : message;
        this.log('verbose', verboseMsg);
    }

    public error(message: string, error?: any): void {
        const errorMsg = error?.message 
            ? `${message}\nError: ${error.message}\nStack: ${error.stack}`
            : message;
        this.log('error', errorMsg);
    }

    public progress(message: string, percentComplete?: number, id?: string): void {
        this.log('progress', message, {
            percentComplete,
            id
        });
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
        let filtered = [...this.logCache];
        
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
                filtered = filtered.filter(entry => 
                    entry.timestamp >= params.filter!.startTime!
                );
            }
            
            if (params.filter.endTime) {
                filtered = filtered.filter(entry => 
                    entry.timestamp <= params.filter!.endTime!
                );
            }
        }

        const offset = params.offset || 0;
        const limit = params.limit || 100;
        const paginated = filtered.slice(offset, offset + limit);

        return {
            logs: paginated,
            total: filtered.length
        };
    }

    private async queueWrite(entry: LogEntry) {
        this.writeQueue.push(entry);
        
        // Debounce writes to batch them
        if (this.writeDebounce) {
            clearTimeout(this.writeDebounce);
        }
        
        this.writeDebounce = setTimeout(async () => {
            await this.flushQueue();
        }, 100); // Batch writes every 100ms
    }

    private async flushQueue() {
        if (this.isWriting || this.writeQueue.length === 0) return;
        
        this.isWriting = true;
        const entries = [...this.writeQueue];
        this.writeQueue = [];
        
        try {
            this.ensureLogDirectoryExists();
            const data = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
            await fs.appendFile(this.logFilePath, data);
        } catch (e) {
            console.error('Error writing logs:', e);
            // Requeue failed writes
            this.writeQueue.unshift(...entries);
        } finally {
            this.isWriting = false;
            
            // If more entries arrived while we were writing
            if (this.writeQueue.length > 0) {
                setTimeout(() => this.flushQueue(), 0);
            }
        }
    }

    async shutdown() {
        // Flush any remaining logs on shutdown
        if (this.writeQueue.length > 0) {
            await this.flushQueue();
        }
    }
}

const Logger = new LogManager();

// Ensure logs are flushed on process exit
process.on('beforeExit', async () => {
    await Logger.shutdown();
});

process.on('SIGINT', async () => {
    await Logger.shutdown();
    process.exit(0);
});

export default Logger;
