export class ClientLogger {
    private logHandler: (level: string, message: string, details?: Record<string, any>) => Promise<void>;
    private originalConsole: typeof console;
    private isConsoleIntercepted = false;
    private areErrorHandlersSetup = false;

    constructor(logHandler: (level: string, message: string, details?: Record<string, any>) => Promise<void>) {
        this.logHandler = logHandler;
        this.originalConsole = { ...console };
    }

    /**
     * Sets up global error handlers
     */
    public setupGlobalErrorHandlers(): void {
        if (this.areErrorHandlersSetup) return;
        
        // Handle uncaught exceptions
        window.addEventListener('error', (event) => {
            this.error(`Uncaught error: ${event.message}`, {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error?.stack
            });
        });

        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            this.error(`Unhandled promise rejection: ${event.reason}`, {
                reason: event.reason?.stack || event.reason
            });
        });

        this.areErrorHandlersSetup = true;
    }

    /**
     * Intercepts all console methods and routes them through the logger
     */
    public interceptConsole(): void {
        if (this.isConsoleIntercepted) return;
        
        console.log = (...args: any[]) => {
            this.info('[console.log] ' + args.join(' '));
            this.originalConsole.log(...args);
        };

        console.info = (...args: any[]) => {
            this.info('[console.info] ' + args.join(' '));
            this.originalConsole.info(...args);
        };

        console.warn = (...args: any[]) => {
            this.warn('[console.warn] ' + args.join(' '));
            this.originalConsole.warn(...args);
        };

        console.error = (...args: any[]) => {
            this.error('[console.error] ' + args.join(' '));
            this.originalConsole.error(...args);
        };

        console.debug = (...args: any[]) => {
            this.debug('[console.debug] ' + args.join(' '));
            this.originalConsole.debug(...args);
        };

        this.isConsoleIntercepted = true;
    }

    /**
     * Restores original console methods
     */
    public restoreConsole(): void {
        if (!this.isConsoleIntercepted) return;
        
        console.log = this.originalConsole.log;
        console.info = this.originalConsole.info;
        console.warn = this.originalConsole.warn;
        console.error = this.originalConsole.error;
        console.debug = this.originalConsole.debug;

        this.isConsoleIntercepted = false;
    }

    private async log(level: string, message: string, details?: Record<string, any>): Promise<void> {
        try {
            await this.logHandler(level, message, details);
        } catch (error) {
            console.error('Failed to send client log:', error);
        }
    }

    public info(message: string, details?: Record<string, any>): void {
        this.log('info', message, details);
    }

    public warn(message: string, details?: Record<string, any>): void {
        this.log('warn', message, details);
    }

    public error(message: string, details?: Record<string, any>): void {
        this.log('error', message, details);
    }

    public debug(message: string, details?: Record<string, any>): void {
        this.log('debug', message, details);
    }

    public verbose(message: string, details?: Record<string, any>): void {
        this.log('verbose', message, details);
    }

    public progress(message: string, percentComplete?: number): void {
        this.log('progress', message, { percentComplete });
    }
}
