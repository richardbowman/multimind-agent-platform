// logger.ts
import { appendFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import { getDataPath } from './paths';

class Logger {
    private static logFilePath = path.join(getDataPath(), `output-${new Date().toISOString().split('T')[0]}.log`);

    private static ensureLogDirectoryExists(): void {
        const dir = path.dirname(Logger.logFilePath);
        mkdirSync(dir, { recursive: true });
    }

    static log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`;
        const logEntry = {
            timestamp: new Date().getTime(),
            level: level.toUpperCase(),
            message
        };

        // Ensure directory exists and append to log file
        this.ensureLogDirectoryExists();
        appendFileSync(Logger.logFilePath, formattedMessage);
        
        // Send to WebSocket if connected
        if (global.socket) {
            global.socket.emit('system_log', logEntry);
        }
        
        console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`)
        // if (this.logBox && level !== "verbose") this.logBox.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
    }

    static info(message: string, error?: any): void {
        const infoMsg = error?.message 
            ? `${message}\nError: ${error.message}\nStack: ${error.stack}`
            : message;
        this.log('info', infoMsg);
    }

    static warn(message: string, error?: any): void {
        const warnMsg = error ?.message
            ? `${message}\nError: ${error.message}\nStack: ${error.stack}`
            : message;
        this.log('warn', warnMsg);
    }

    static verbose(message: string, error?: any): void {
        const verboseMsg = error?.message 
            ? `${message}\nError: ${error.message}\nStack: ${error.stack}`
            : message;
        this.log('verbose', verboseMsg);
    }

    static error(message: string, error?: any): void {
        const errorMsg = error?.message 
            ? `${message}\nError: ${error.message}\nStack: ${error.stack}`
            : message;
        this.log('error', errorMsg);
    }
}

export default Logger;
