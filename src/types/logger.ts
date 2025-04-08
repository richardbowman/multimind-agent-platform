export interface SystemLogger {
    error(message: string, error?: any): void;
    verbose(message: string, obj?: any): void;
    info(message: string, obj?: any): void;
    warn(message: string, obj?: any): void;
}