import { Sequelize, Model, DataTypes, Optional } from 'sequelize';
import { Task, Project, TaskType, ProjectMetadata, RecurringTask, RecurrencePattern } from './taskManager';
import { UUID } from 'src/types/uuid';
import { TaskStatus } from 'src/schemas/TaskStatus';

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

export class TaskModel extends Model<TaskAttributes, TaskCreationAttributes> {
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

    public readonly ProjectModel?: ProjectModel;

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public static mapToTask(taskModel: TaskModel): Task {
        if (!taskModel) return taskModel;

        try {
            return {
                id: taskModel.id,
                description: taskModel.description,
                category: taskModel.category,
                status: taskModel.status,
                type: taskModel.type,
                projectId: taskModel.projectId,
                creator: taskModel.creator,
                assignee: taskModel.assignee,
                order: taskModel.order,
                dependsOn: taskModel.dependsOn,
                props: taskModel.props,
                // Maintain backwards compatibility
                complete: taskModel.status === TaskStatus.Completed,
                inProgress: taskModel.status === TaskStatus.InProgress
            };
        } catch (error) {
            throw new Error(`Error mapping task model: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public static initialize(sequelize: Sequelize): void {
        TaskModel.init({
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
                allowNull: false,
                validate: {
                    isUUID: 4
                }
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
                allowNull: false,
                validate: {
                    isUUID: 4
                }
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
            timestamps: true,
            paranoid: true // Enable soft deletion
        });

        // Associations will be set up after both models are initialized
    }

    public static setupAssociations(): void {
        TaskModel.belongsTo(ProjectModel, {
            foreignKey: {
                name: 'projectId',
                allowNull: false
            }
        });
    }
}

interface ProjectAttributes {
    id: UUID;
    name: string;
    metadata: ProjectMetadata;
}

interface ProjectCreationAttributes extends Optional<ProjectAttributes, 'id'> {}

export class ProjectModel extends Model<ProjectAttributes, ProjectCreationAttributes> {
    public id!: UUID;
    public name!: string;
    public metadata!: ProjectMetadata;
    public TaskModels?: TaskModel[];

    public readonly createdAt!: Date;
    public readonly updatedAt!: Date;

    public static mapToProject(projectModel: ProjectModel): Project {
        if (!projectModel) return projectModel;

        // Convert TaskModel instances to Task objects
        const tasks = projectModel.TaskModels?.reduce((acc, task) => {
            acc[task.id] = TaskModel.mapToTask(task);
            return acc;
        }, {} as Record<string, Task>) || {};

        return {
            id: projectModel.id,
            name: projectModel.name,
            metadata: projectModel.metadata,
            tasks // Include the mapped tasks
        };
    }

    public static initialize(sequelize: Sequelize): void {
        ProjectModel.init({
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
                allowNull: false,
                validate: {
                    isUUID: 4
                }
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
            timestamps: true,
            paranoid: true // Enable soft deletion
        });

        // Associations will be set up after both models are initialized
    }

    public static setupAssociations(): void {
        ProjectModel.hasMany(TaskModel, {
            foreignKey: 'projectId'
        });
    }
}
