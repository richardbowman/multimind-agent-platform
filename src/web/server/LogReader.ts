import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
}

export class LogReader {
    private logFilePath: string;

    constructor() {
        // Match the path used in Logger
        const today = new Date().toISOString().split('T')[0];
        this.logFilePath = join(process.cwd(), '.output', `output-${today}.log`);
    }

    readLogs(): LogEntry[] {
        if (!existsSync(this.logFilePath)) {
            return [];
        }

        try {
            const content = readFileSync(this.logFilePath, 'utf-8');
            return content
                .split('\n')
                .filter(line => line.trim())
                .map(line => {
                    // Parse log line format: [timestamp] LEVEL: message
                    const match = line.match(/\[(.*?)\] ([A-Z]+): (.*)/);
                    if (match) {
                        return {
                            timestamp: match[1],
                            level: match[2],
                            message: match[3]
                        };
                    }
                    return null;
                })
                .filter((entry): entry is LogEntry => entry !== null)
                .slice(-1000); // Limit to last 1000 entries
        } catch (error) {
            console.error('Error reading logs:', error);
            return [];
        }
    }
}
