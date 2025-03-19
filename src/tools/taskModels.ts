import { Sequelize, Model, DataTypes, Optional } from 'sequelize';
import { Task, Project, TaskStatus, TaskType, ProjectMetadata, RecurringTask, RecurrencePattern } from './taskManager';
import { UUID } from 'src/types/uuid';

interface TaskAttributes {
    id: UUID;
    description: string;
    category: string;
    status: TaskStatus;
    type: TaskType;
    projectId: UUID;
    creator: UUID | 'system';
    assignee?: UUID;
    order?: number;
    dependsOn?: UUID;
    props: Record<string, any>;
    recurrencePattern?: RecurrencePattern;
    lastRunDate?: Date;
}

interface TaskCreationAttributes extends Optional<TaskAttributes, 'id'> {}

export class TaskModel extends Model<TaskAttributes, TaskCreationAttributes> implements Task {
    public id!: UUID;
    public description!: string;
    public category!: string;
    public status!: TaskStatus;
    public type!: TaskType;
    public projectId!: UUID;
    public creator!: UUID | 'system';
    public assignee?: UUID;
    public order?: number;
    public dependsOn?: UUID;
    public props!: Record<string, any>;
    public recurrencePattern?: RecurrencePattern;
    public lastRunDate?: Date;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public static initialize(sequelize: Sequelize): void {
        TaskModel.init({
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true
            },
            description: {
                type: DataTypes.TEXT,
                allowNull: false
            },
            category: {
                type: DataTypes.STRING,
                defaultValue: ''
            },
            status: {
                type: DataTypes.ENUM(...Object.values(TaskStatus)),
                allowNull: false
            },
            type: {
                type: DataTypes.ENUM(...Object.values(TaskType)),
                allowNull: false
            },
            projectId: {
                type: DataTypes.UUID,
                allowNull: false
            },
            creator: {
                type: DataTypes.STRING,
                allowNull: false
            },
            assignee: {
                type: DataTypes.UUID,
                allowNull: true
            },
            order: {
                type: DataTypes.INTEGER,
                allowNull: true
            },
            dependsOn: {
                type: DataTypes.UUID,
                allowNull: true
            },
            props: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {}
            },
            recurrencePattern: {
                type: DataTypes.ENUM(...Object.values(RecurrencePattern)),
                allowNull: true
            },
            lastRunDate: {
                type: DataTypes.DATE,
                allowNull: true
            }
        }, {
            sequelize,
            tableName: 'tasks',
            timestamps: true
        });
    }
}

interface ProjectAttributes {
    id: UUID;
    name: string;
    metadata: ProjectMetadata;
}

interface ProjectCreationAttributes extends Optional<ProjectAttributes, 'id'> {}

export class ProjectModel extends Model<ProjectAttributes, ProjectCreationAttributes> implements Project {
    public id!: UUID;
    public name!: string;
    public metadata!: ProjectMetadata;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public static initialize(sequelize: Sequelize): void {
        ProjectModel.init({
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true
            },
            name: {
                type: DataTypes.STRING,
                allowNull: false
            },
            metadata: {
                type: DataTypes.JSONB,
                allowNull: false,
                defaultValue: {
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    status: 'active',
                    priority: 'medium'
                }
            }
        }, {
            sequelize,
            tableName: 'projects',
            timestamps: true
        });
    }
}
