import * as fs from 'fs';
import * as path from 'path';
import Logger from '../helpers/logger';
import { AsyncQueue } from '../helpers/asyncQueue';
import EventEmitter from 'events';
import { getDataPath } from '../helpers/paths';

export interface LogParam {
    type: string;
    entry: any;
}

export interface LLMLogEntry {
    timestamp: string;
    method: string;
    input: any;
    output: any;
    durationMs?: number;
    error?: {
        message: string;
        stack: string;
    };
}

export class LLMCallLogger extends EventEmitter {
    private logDir: string;
    private sessionId: string;
    private logFile: string;
    private static fileQueue = new AsyncQueue();

    constructor(serviceName: string) {
        super();
        
        this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
        this.logDir = path.join(getDataPath(), 'llm');
        this.logFile = path.join(this.logDir, `${serviceName}-${this.sessionId}.jsonl`);
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    async logCall(method: string, input: any, output: any, error?: any, durationMs?: number) {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                method,
                input,
                output,
                durationMs,
                error: error ? {
                    message: error.message,
                    stack: error.stack
                } : undefined
            };

            await LLMCallLogger.fileQueue.enqueue(async () => {
                await fs.promises.appendFile(
                    this.logFile,
                    JSON.stringify(logEntry) + '\n',
                    'utf8'
                );
            });

            this.emit("log", logEntry);
        } catch (err) {
            Logger.error('Failed to write LLM log:', err);
        }
    }

    async getLogs(): Promise<LLMLogEntry[]> {
        try {
            if (!fs.existsSync(this.logFile)) {
                return [];
            }

            const content = await LLMCallLogger.fileQueue.enqueue(async () => {
                return await fs.promises.readFile(this.logFile, 'utf8');
            });
            const lines = content.trim().split('\n');
            return lines.map(line => JSON.parse(line))
                       .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        } catch (err) {
            Logger.error('Failed to read LLM logs:', err);
            return [];
        }
    }

    static async getAllLogs(): Promise<Record<string, LLMLogEntry[]>> {
        try {
            const logDir = path.join(getDataPath(), 'llm');
            if (!fs.existsSync(logDir)) {
                return {};
            }

            const files = await fs.promises.readdir(logDir);
            const logs: Record<string, LLMLogEntry[]> = {};

            // Collect all entries across all files
            const allEntries: LLMLogEntry[] = [];
            
            for (const file of files) {
                if (!file.endsWith('.jsonl')) continue;
                
                const content = await LLMCallLogger.fileQueue.enqueue(async () => {
                    return await fs.promises.readFile(
                        path.join(logDir, file),
                        'utf8'
                    );
                });
                const lines = content.trim().split('\n');
                const serviceName = file.split('-')[0];
                const entries = lines.map(line => ({
                    ...JSON.parse(line),
                    serviceName
                }));
                allEntries.push(...entries);
            }

            // Sort all entries by timestamp descending
            allEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            // Group by service name while maintaining the global sort order
            const sortedLogs: Record<string, LLMLogEntry[]> = {};
            for (const entry of allEntries) {
                if (!sortedLogs[entry.serviceName]) {
                    sortedLogs[entry.serviceName] = [];
                }
                sortedLogs[entry.serviceName].push(entry);
            }

            return sortedLogs;
        } catch (err) {
            Logger.error('Failed to read all LLM logs:', err);
            return {};
        }
    }

    async getLogsPaginated(offset: number, limit: number): Promise<LLMLogEntry[]> {
        try {
            if (!fs.existsSync(this.logFile)) {
                return [];
            }

            const content = await LLMCallLogger.fileQueue.enqueue(async () => {
                return await fs.promises.readFile(this.logFile, 'utf8');
            });

            const lines = content.trim().split('\n');
            const allEntries = lines.map(line => JSON.parse(line))
                                  .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            return allEntries.slice(offset, offset + limit);
        } catch (err) {
            Logger.error('Failed to read LLM logs:', err);
            return [];
        }
    }

    async getAllLogsPaginated(offset: number, limit: number): Promise<LLMLogEntry[]> {
        try {
            const logDir = path.join(getDataPath(), 'llm');
            if (!fs.existsSync(logDir)) {
                return [];
            }

            const files = await fs.promises.readdir(logDir);
            const logs: Record<string, LLMLogEntry[]> = {};

            // Collect all entries across all files
            const allEntries: LLMLogEntry[] = [];

            for (const file of files) {
                if (!file.endsWith('.jsonl')) continue;

                const content = await LLMCallLogger.fileQueue.enqueue(async () => {
                    return await fs.promises.readFile(
                        path.join(logDir, file),
                        'utf8'
                    );
                });
                const lines = content.trim().split('\n');
                const serviceName = file.split('-')[0];
                const entries = lines.map(line => ({
                    ...JSON.parse(line),
                    serviceName
                }));
                allEntries.push(...entries);
            }

            // Sort all entries by timestamp descending
            allEntries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

            // Get the paginated slice
            const paginatedEntries = allEntries.slice(offset, offset + limit);
            return paginatedEntries;
        } catch (err) {
            Logger.error('Failed to read all LLM logs:', err);
            return [];
        }
    }
}
