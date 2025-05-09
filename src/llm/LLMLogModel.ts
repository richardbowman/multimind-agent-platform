import { Sequelize, Model, DataTypes } from 'sequelize';
import { LLMContext } from './ILLMService';
import Logger from 'src/helpers/logger';

export interface LLMLogEntry {
    id?: number;
    timestamp: Date;
    method: string;
    input: any;
    output: any;
    durationMs?: number;
    error?: {
        message: string;
        stack: string;
    };
    serviceName: string;
    context?: LLMContext;
}

export class LLMLogModel extends Model {
    public static initialize(sequelize: Sequelize) {
        if (!sequelize) {
            throw new Error('Sequelize instance is required');
        }

        try {
            this.init({
                id: {
                    type: DataTypes.INTEGER,
                    autoIncrement: true,
                    primaryKey: true
                },
                timestamp: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW
                },
                method: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    defaultValue: ''
                },
                input: {
                    type: DataTypes.JSON,
                    allowNull: false,
                    defaultValue: {}
                },
                output: {
                    type: DataTypes.JSON,
                    allowNull: false,
                    defaultValue: {}
                },
                durationMs: {
                    type: DataTypes.INTEGER,
                    allowNull: true
                },
                error: {
                    type: DataTypes.JSON,
                    allowNull: true
                },
                serviceName: {
                    type: DataTypes.STRING,
                    allowNull: false,
                    defaultValue: ''
                },
                context: {
                    type: DataTypes.JSON,
                    allowNull: true
                }
            }, {
                sequelize,
                tableName: 'llm_logs',
                timestamps: false
            });
        } catch (error) {
            Logger.error('Failed to initialize LLMLogModel:', error);
            throw error;
        }
    }
}
