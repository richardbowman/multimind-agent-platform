// logger.ts
import { appendFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import { getDataPath } from './paths';
import { Socket } from 'socket.io';
import EventEmitter from 'events';

declare global {
    var socket: Socket | undefined;
}

export interface LogEntry {
    timestamp: number;
    isoTime: string;
    level: string;
    message: string;
    details?: Record<string, any>;
}

export class LogManager extends EventEmitter {
    private logFilePath = path.join(getDataPath(), `output-${new Date().toISOString().split('T')[0]}.jsonl`);
    private logCache: LogEntry[] = [];
    private cacheSize = 10000;

    private ensureLogDirectoryExists(): void {
        const dir = path.dirname(Logger.logFilePath);
        mkdirSync(dir, { recursive: true });
    }

    private addToCache(entry: LogEntry) {
        this.logCache.push(entry);
        // Keep only the most recent entries
        if (this.logCache.length > this.cacheSize) {
            this.logCache.shift();
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
        try {
            if (level !== "progress") {
                this.ensureLogDirectoryExists();
                appendFileSync(Logger.logFilePath, JSON.stringify(logEntry) + '\n');
                this.addToCache(logEntry);
            }
        } catch (e) {
            //swallow errors, this can happen as process is exiting
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
            logs: paginated.reverse(), // Return most recent first
            total: filtered.length
        };
    }
}

const Logger = new LogManager();
export default Logger;
