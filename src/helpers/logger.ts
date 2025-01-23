// logger.ts
import { appendFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import { getDataPath } from './paths';
import { Socket } from 'socket.io';
import EventEmitter from 'events';

declare global {
    var socket: Socket | undefined;
}

export class LogManager extends EventEmitter {
    private logFilePath = path.join(getDataPath(), `output-${new Date().toISOString().split('T')[0]}.log`);

    private ensureLogDirectoryExists(): void {
        const dir = path.dirname(Logger.logFilePath);
        mkdirSync(dir, { recursive: true });
    }

    log(level: string, message: string, details?: Record<string, any>): void {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`;
        const logEntry = {
            timestamp: new Date().getTime(),
            level: level.toUpperCase(),
            message,
            details
        };

        // Ensure directory exists and append to log file
        try {
            this.ensureLogDirectoryExists();
            appendFileSync(Logger.logFilePath, formattedMessage);
        } catch (e) {
            //swallow errors, this can happen as process is exiting
        }

        // Send to WebSocket if connected
        if (global.socket) {
            global.socket.emit('system_log', logEntry);
        }
        this.emit("_" + level.toLowerCase(), logEntry);
        
        if (level !== "verbose" && level !== "debug") console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`)
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

    public progress(message: string, percentComplete?: number): void {
        this.log('progress', message, {
            percentComplete
        });
    }
}

const Logger = new LogManager();

export default Logger;
