import fs from 'fs';
import path from 'path';
import Logger from '../helpers/logger';
import { AsyncQueue } from '../helpers/asyncQueue';

export interface LLMLogEntry {
    timestamp: string;
    method: string;
    input: any;
    output: any;
    error?: {
        message: string;
        stack: string;
    };
}

export class LLMCallLogger {
    private logDir: string;
    private sessionId: string;
    private logFile: string;
    private static fileQueue = new AsyncQueue();

    constructor(serviceName: string) {
        this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
        this.logDir = path.join(process.cwd(), '.output', 'llm');
        this.logFile = path.join(this.logDir, `${serviceName}-${this.sessionId}.jsonl`);
        
        // Ensure .output and llm directories exist
        const outputDir = path.join(process.cwd(), '.output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    async logCall(method: string, input: any, output: any, error?: any) {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                method,
                input,
                output,
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
            return lines.map(line => JSON.parse(line));
        } catch (err) {
            Logger.error('Failed to read LLM logs:', err);
            return [];
        }
    }

    static async getAllLogs(): Promise<Record<string, LLMLogEntry[]>> {
        try {
            const logDir = path.join(process.cwd(), '.output', 'llm');
            if (!fs.existsSync(logDir)) {
                return {};
            }

            const files = await fs.promises.readdir(logDir);
            const logs: Record<string, LLMLogEntry[]> = {};

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
                logs[serviceName] = lines.map(line => JSON.parse(line));
            }

            return logs;
        } catch (err) {
            Logger.error('Failed to read all LLM logs:', err);
            return {};
        }
    }
}
