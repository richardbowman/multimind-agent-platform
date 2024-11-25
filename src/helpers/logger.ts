// logger.ts
class Logger {
    static logBox: Log;

    static log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        // console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
        this.logBox.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
    }

    static info(message: string): void {
        this.log('info', message);
    }

    static warn(message: string): void {
        this.log('warn', message);
    }

    static error(message: string): void {
        this.log('error', message);
    }
}

export default Logger;