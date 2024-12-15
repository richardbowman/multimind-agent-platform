// logger.ts
import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';


class Logger {
    static logBox: Blessed.Log;
    private static logFilePath = `./.output/output-${new Date().toISOString().split('T')[0]}.log`;

    private static ensureLogDirectoryExists(): void {
        const dir = dirname(Logger.logFilePath);
        mkdirSync(dir, { recursive: true });
    }

    static log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`;

        // Ensure directory exists and append to log file
        this.ensureLogDirectoryExists();
        appendFileSync(Logger.logFilePath, formattedMessage);
        
        if (this.logBox && level !== "verbose") this.logBox.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
    }

    static info(message: string): void {
        this.log('info', message);
    }

    static warn(message: string): void {
        this.log('warn', message);
    }

    static verbose(message: string): void {
        this.log('verbose', message);
    }

    static error(message: string, error?: any): void {
        const errorMsg = error 
            ? `${message}\nError: ${error.message}\nStack: ${error.stack}`
            : message;
        this.log('error', errorMsg);
    }
}

export default Logger;
