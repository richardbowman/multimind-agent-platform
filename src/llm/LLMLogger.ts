import fs from 'fs';
import path from 'path';
import Logger from '../helpers/logger';

export class LLMCallLogger {
    private logDir: string;
    private sessionId: string;
    private logFile: string;

    constructor(serviceName: string) {
        this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
        this.logDir = path.join(process.cwd(), 'logs', 'llm');
        this.logFile = path.join(this.logDir, `${serviceName}-${this.sessionId}.json`);
        
        // Ensure log directory exists
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

            await fs.promises.appendFile(
                this.logFile,
                JSON.stringify(logEntry, null, 2) + '\n',
                'utf8'
            );
        } catch (err) {
            Logger.error('Failed to write LLM log:', err);
        }
    }
}
