import { RPCService } from './RPCService';

export class ClientLogger {
    private rpc: RPCService;

    constructor(rpc: RPCService) {
        this.rpc = rpc;
    }

    private async log(level: string, message: string, details?: Record<string, any>): Promise<void> {
        try {
            await this.rpc.logClientEvent(level, message, details);
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
