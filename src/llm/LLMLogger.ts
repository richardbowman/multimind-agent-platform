import { Sequelize } from 'sequelize';
import Logger from '../helpers/logger';
import EventEmitter from 'events';
import { LLMContext } from './ILLMService';
import { LLMLogModel, LLMLogEntry } from './LLMLogModel';
import { getDataPath } from 'src/helpers/paths';
import path from 'node:path';

export class LLMCallLogger extends EventEmitter {
    private sequelize: Sequelize;
    private serviceName: string;

    constructor(serviceName: string, storageDir: string) {
        super();
        this.serviceName = serviceName;
        const logDir = path.join(getDataPath(), 'llm');
        // Initialize SQLite database
       const dbPath = path.join(logDir, 'logs.db');
       this.sequelize = new Sequelize({
           dialect: 'sqlite',
           storage: dbPath,
           logging: msg => Logger.verbose(msg)
       });
    }

    async logCall(
        method: string, 
        input: any, 
        output: any, 
        error?: any, 
        durationMs?: number,
        context?: LLMContext
    ) {
        try {
            const logEntry = await LLMLogModel.create({
                timestamp: new Date(),
                method,
                input,
                output,
                durationMs,
                error: error ? {
                    message: error.message,
                    stack: error.stack
                } : undefined,
                serviceName: this.serviceName,
                context
            });

            this.emit("log", logEntry);
        } catch (err) {
            Logger.error('Failed to write LLM log:', err);
        }
    }

    async getLogs(): Promise<LLMLogEntry[]> {
        try {
            return await LLMLogModel.findAll({
                where: { serviceName: this.serviceName },
                order: [['timestamp', 'DESC']]
            });
        } catch (err) {
            Logger.error('Failed to read LLM logs:', err);
            return [];
        }
    }

    static async getAllLogs(): Promise<Record<string, LLMLogEntry[]>> {
        try {
            const allEntries = await LLMLogModel.findAll({
                order: [['timestamp', 'DESC']]
            });

            // Group by service name while maintaining the global sort order
            const sortedLogs: Record<string, LLMLogEntry[]> = {};
            for (const entry of allEntries) {
                if (!sortedLogs[entry.serviceName]) {
                    sortedLogs[entry.serviceName] = [];
                }
                sortedLogs[entry.serviceName].push(entry);
            }

            return sortedLogs;
        } catch (err) {
            Logger.error('Failed to read all LLM logs:', err);
            return {};
        }
    }

    async getLogsPaginated(offset: number, limit: number): Promise<LLMLogEntry[]> {
        try {
            return await LLMLogModel.findAll({
                where: { serviceName: this.serviceName },
                order: [['timestamp', 'DESC']],
                offset,
                limit
            });
        } catch (err) {
            Logger.error('Failed to read LLM logs:', err);
            return [];
        }
    }

    async getAllLogsPaginated(offset: number, limit: number): Promise<LLMLogEntry[]> {
        try {
            return await LLMLogModel.findAll({
                order: [['timestamp', 'DESC']],
                offset,
                limit
            });
        } catch (err) {
            Logger.error('Failed to read all LLM logs:', err);
            return [];
        }
    }
}
