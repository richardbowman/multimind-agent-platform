// logger.ts
class Logger {
    static logBox: Log;

    static log(level: string, message: string): void {
        const timestamp = new Date().toISOString();
        // console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
        if (this.logBox) this.logBox.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`);
    }

    static info(message: string): void {
        this.log('info', message);
    }

    static warn(message: string): void {
        this.log('warn', message);
    }

    static error(message: string, error?: any): void {
        this.log('error', message);
        if (error) this.log('error', error.toString());
    }
}

export default Logger;