// logger.ts
import { appendFileSync } from 'fs';


class Logger {
    static logBox: Blessed.Log;
    private static logFilePath = `./.output/output-${new Date().toISOString().split('T')[0]}.log`;

    static log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`;

        // Append to log file
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
        this.log('error', message);
        if (error) this.log('error', `Error:${error.message}\nStack:${error.stack}`);
    }
}

export default Logger;