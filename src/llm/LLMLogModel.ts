import { Sequelize, Model, DataTypes } from 'sequelize';
import { UUID } from '../types/uuid';
import { LLMContext } from './ILLMService';

export interface LLMLogEntry {
    id?: number;
    timestamp: string;
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

export class LLMLogModel extends Model<LLMLogEntry> {
    public id!: number;
    public timestamp!: string;
    public method!: string;
    public input!: any;
    public output!: any;
    public durationMs?: number;
    public error?: any;
    public serviceName!: string;
    public context?: any;

    public static initialize(sequelize: Sequelize) {
        this.init({
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true
            },
            timestamp: {
                type: DataTypes.DATE,
                allowNull: false
            },
            method: {
                type: DataTypes.STRING,
                allowNull: false
            },
            input: {
                type: DataTypes.JSON,
                allowNull: false
            },
            output: {
                type: DataTypes.JSON,
                allowNull: false
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
                allowNull: false
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
    }
}
