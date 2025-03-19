import cron from 'node-cron';
import * as Events from 'events';
import { AddTaskParams, CreateProjectParams, Project, ProjectMetadata, RecurrencePattern, RecurringTask, Task, TaskManager, TaskType } from '../tools/taskManager';
import { TaskStatus } from 'src/schemas/TaskStatus';
import Logger from 'src/helpers/logger';
import { AsyncQueue } from '../helpers/asyncQueue';
import { createUUID, UUID } from 'src/types/uuid';
import { Op, Sequelize } from 'sequelize';
import { TaskModel, ProjectModel } from '../tools/taskModels';
import { DatabaseMigrator } from 'src/database/migrator';
import { getDataPath } from 'src/helpers/paths';
import fs from 'node:fs';
import path from 'node:path';

export enum TaskManagerEvents {

}

class SimpleTaskManager extends Events.EventEmitter implements TaskManager {
    private sequelize: Sequelize;
    private migrator: DatabaseMigrator;
    private saveQueue: AsyncQueue = new AsyncQueue();
    private lastCheckTime: number = Date.now();
    private initialized: boolean = false;

    constructor() {
        super();
        Logger.info("Starting task manager (should not happen more than once)");
        this.setMaxListeners(100);

        // Initialize SQLite database
        const dbPath = path.join(getDataPath(), 'tasks.db');
        this.sequelize = new Sequelize({
            dialect: 'sqlite',
            storage: dbPath,
            logging: msg => Logger.verbose(msg)
        });

        // Initialize migrator
        const migrationsDir = path.join(getDataPath(), 'migrations');
        this.migrator = new DatabaseMigrator(this.sequelize, migrationsDir);

        // Initialize models first
        ProjectModel.initialize(this.sequelize);
        TaskModel.initialize(this.sequelize);
        
        // Then set up associations
        ProjectModel.setupAssociations(TaskModel);
        TaskModel.setupAssociations(ProjectModel);
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        try {
            // Ensure the data directory exists
            await fs.promises.mkdir(getDataPath(), { recursive: true });

            // Run migrations
            await this.migrator.migrate();

            // Sync models with database
            await this.sequelize.sync({ alter: true });

            this.initialized = true;
            Logger.info('Task manager initialized successfully');
        } catch (err) {
            Logger.error('Error initializing task manager:', err);
            throw err;
        }
    }

    async addTask(project: Project, addTask: AddTaskParams): Promise<Task> {
        return this.saveQueue.enqueue(async () => {
            // Get max order for new task
            const maxOrder : number = (await TaskModel.max('order', {
                where: { projectId: project.id }
            })) || 0;

            const task = await TaskModel.create({
                id: createUUID(),
                category: "",
                status: TaskStatus.Pending,
                type: TaskType.Standard,
                ...addTask,
                projectId: project.id,
                order: maxOrder + 1,
                props: {
                    ...addTask.props,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });

            // Emit taskAdded event
            await this.asyncEmit('taskAdded', { task, project });

            return TaskModel.mapToTask(task);
        });
    }

    newProjectId(): UUID {
        return createUUID();
    }

    async addProject(project: Partial<Project>): Promise<Project> {
        return this.saveQueue.enqueue(async () => {
            const newProject = await ProjectModel.create({
                id: createUUID(),
                name: `Project created ${new Date()}`,
                ...project,
                metadata: {
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    status: 'active',
                    priority: 'medium',
                    ...project.metadata
                }
            });

            return ProjectModel.mapToProject(newProject);
        });
    }

    async createProject(params: CreateProjectParams): Promise<Project> {
        return this.saveQueue.enqueue(async () => {
            const project = await ProjectModel.create({
                name: params.name,
                metadata: {
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    status: "active",
                    priority: "medium",
                    ...params.metadata
                }
            });

            if (params.tasks) {
                for (const task of params.tasks) {
                    await this.addTask(ProjectModel.mapToProject(project), {
                        id: createUUID(),
                        description: task.description,
                        type: task.type,
                        creator: 'system'
                    });
                }
            }

            return ProjectModel.mapToProject(project);
        });
    }

    async getProject(projectId: string): Promise<Project> {
        const project = await ProjectModel.findByPk(projectId, {
            include: [{
                model: TaskModel,
                as: 'tasks'
            }]
        });

        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        return ProjectModel.mapToProject(project);
    }

    async save(): Promise<void> {
        // No-op since we're using Sequelize
    }

    async load(): Promise<void> {
        // No-op since we're using Sequelize
    }

    async assignTaskToAgent(taskId: UUID, assignee: UUID): Promise<void> {
        return this.saveQueue.enqueue(async () => {
            const task = await TaskModel.findByPk(taskId);
            if (!task) {
                throw new Error(`Task with ID ${taskId} not found`);
            }

            await task.update({ assignee });
            await this.asyncEmit('taskAssigned', task);
        });
    }

    async getNextTaskForUser(userId: UUID): Promise<Task | null> {
        return this.saveQueue.enqueue(async () => {
            const now = Date.now();

            // Find all tasks assigned to user that are pending
            const tasks = await TaskModel.findAll({
                where: {
                    assignee: userId,
                    status: TaskStatus.Pending
                },
                include: [{
                    model: ProjectModel,
                    as: 'project'
                }]
            });

            // First filter tasks with future due dates
            const tasksWithoutFutureDueDates = tasks.filter(task =>
                !(task.props?.dueDate && new Date(task.props.dueDate).getTime() > now)
            );

            // Get all dependency statuses in one query
            const dependencyIds = tasksWithoutFutureDueDates
                .map(t => t.dependsOn)
                .filter(Boolean) as UUID[];

            const dependencyStatuses = await TaskModel.findAll({
                where: {
                    id: dependencyIds
                },
                attributes: ['id', 'status']
            });

            const dependencyMap = new Map(dependencyStatuses.map(d => [d.id, d.status]));

            // Filter tasks based on dependencies
            const eligibleTasks = tasksWithoutFutureDueDates.filter(task => {
                if (task.dependsOn) {
                    const depStatus = dependencyMap.get(task.dependsOn);
                    return depStatus === TaskStatus.Completed;
                }
                return true;
            }).sort((a, b) => {
                // Sort by due date first
                const aDue = a.props?.dueDate ? new Date(a.props.dueDate).getTime() : Infinity;
                const bDue = b.props?.dueDate ? new Date(b.props.dueDate).getTime() : Infinity;
                if (aDue !== bDue) {
                    return aDue - bDue;
                }
                // Then by order
                return (a.order ?? Infinity) - (b.order ?? Infinity);
            });

            return TaskModel.mapToTask(eligibleTasks[0]) || null;
        });
    }

    async markTaskInProgress(task: Task | string): Promise<Task> {
        return this.saveQueue.enqueue(async () => {
            const taskId = typeof (task) === 'string' ? task : task.id;

            const existingTask = await TaskModel.findByPk(taskId);
            if (!existingTask) {
                throw new Error(`Task ${taskId} not found`);
            }

            if (existingTask.status === TaskStatus.InProgress) {
                Logger.warn(`Task ${taskId} already marked in-progress but markTaskInProgress was called again`, new Error());
                return TaskModel.mapToTask(existingTask);
            }
            if (existingTask.status === TaskStatus.Cancelled) {
                Logger.warn(`Trying to start task ${taskId} which is cancelled`, new Error());
                return TaskModel.mapToTask(existingTask);
            }

            await existingTask.update({
                status: TaskStatus.InProgress
            });

            return TaskModel.mapToTask(existingTask);
        });
    }

    private async asyncEmit(eventName, ...eventArgs) {
        // Emit the 'taskCompleted' event with the task
        const listeners = this.listeners(eventName);
        Logger.verbose(`Calling event listener ${eventName}`);
        for (const listener of listeners) {
            try {
                await listener.apply(this, eventArgs);
            } catch (e) {
                Logger.error(`Error running event listener in task manager`, e);
            }
        }
    }

    async completeTask(id: string): Promise<Task> {
        return TaskModel.mapToTask(await this.saveQueue.enqueue(async () => {
            const existingTask = await TaskModel.findByPk(id);
            if (!existingTask) {
                throw new Error(`Task ${id} not found`);
            }

            if (existingTask.status === TaskStatus.Completed) {
                Logger.warn(`Task ${id} already marked complete but complete was called again`, new Error());
                return existingTask;
            }
            if (existingTask.status === TaskStatus.Cancelled) {
                Logger.warn(`Trying to complete task ${id} which is cancelled`, new Error());
                return existingTask;
            }

            await existingTask.update({
                status: TaskStatus.Completed
            });

            await this.asyncEmit("taskCompleted", existingTask);

            // Find any tasks that were dependent on this one
            const dependentTasks = await TaskModel.findAll({
                where: {
                    dependsOn: existingTask.id,
                    status: { [Op.ne]: TaskStatus.Completed }
                }
            });

            // Emit 'ready' event for each dependent task
            for (const dependentTask of dependentTasks) {
                await this.asyncEmit('taskReady', {
                    task: dependentTask,
                    project: await ProjectModel.findByPk(dependentTask.projectId),
                    dependency: existingTask
                });
            };

            // Check if all tasks in the project are completed
            if (await this.areAllTasksCompleted(existingTask.projectId)) {
                await this.asyncEmit('projectCompleted', {
                    project: await ProjectModel.findByPk(existingTask.projectId),
                    task: existingTask,
                    creator: existingTask.creator,
                    assignee: existingTask.assignee
                });
            }

            return existingTask;
        }));
    }

    private async areAllTasksCompleted(projectId: string): Promise<boolean> {
        const incompleteTasks = await TaskModel.count({
            where: {
                projectId,
                status: { [Op.ne]: TaskStatus.Completed }
            }
        });

        return incompleteTasks === 0;
    }

    async getProjectByTaskId(taskId: string): Promise<Project> {
        const task = await TaskModel.findByPk(taskId, {
            include: [{
                model: ProjectModel,
                as: 'project'
            }]
        });

        if (!task || !task.project) {
            throw new Error(`No project found with task ID ${taskId}`);
        }

        return ProjectModel.mapToProject(task.project);
    }

    async replaceProject(project: Project): Promise<void> {
        return this.saveQueue.enqueue(async () => {
            // Update project metadata
            await ProjectModel.update({
                metadata: {
                    ...project.metadata,
                    updatedAt: new Date()
                }
            }, {
                where: { id: project.id }
            });

            // Update all tasks in the project
            const tasks = await TaskModel.findAll({
                where: { projectId: project.id }
            });

            for (const task of tasks) {
                await this.asyncEmit('taskUpdated', { task, project });
            }
        });
    }

    async getProjects(): Promise<Project[]> {
        return (await ProjectModel.findAll({
            include: [{
                model: TaskModel,
                as: 'tasks'
            }]
        })).map(ProjectModel.mapToProject);
    }

    async getNextTask(projectId: string): Promise<Task | null> {
        const tasks = await TaskModel.findAll({
            where: {
                projectId,
                [Op.or]: [
                    { status: TaskStatus.Pending },
                    { status: TaskStatus.InProgress }
                ],
                status: { [Op.ne]: TaskStatus.Cancelled }
            },
            order: [['order', 'ASC']],
            limit: 1
        });

        return tasks[0] ? TaskModel.mapToTask(tasks[0]) : null;
    }

    async getProjectTasks(projectId: string, type?: TaskType): Promise<Task[]> {
        const where: any = { projectId };
        if (type) {
            where.type = type;
        }

        return (await TaskModel.findAll({
            where,
            order: [['order', 'ASC']]
        })).map(TaskModel.mapToTask);
    }

    async getTaskById(taskId: string): Promise<Readonly<Task> | null> {
        const task = await TaskModel.findByPk(taskId);
        if (!task) {
            return null;
        }
        // Return a deep frozen copy to prevent direct modification
        return Object.freeze(TaskModel.mapToTask(task));
    }

    async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
        return this.saveQueue.enqueue(async () => {
            const project = await ProjectModel.findByPk(projectId);
            if (!project) {
                throw new Error(`Project with ID ${projectId} not found`);
            }

            // Validate project properties
            if (updates.name && typeof updates.name !== 'string') {
                throw new Error('Project name must be a string');
            }

            // Update project
            await project.update({
                ...updates,
                metadata: {
                    ...project.metadata,
                    ...updates.metadata,
                    updatedAt: new Date()
                }
            });

            // Emit projectUpdated event
            await this.asyncEmit('projectUpdated', { project });

            return ProjectModel.mapToProject(project);
        });
    }

    async cancelTask(taskId: string): Promise<Task> {
        return this.saveQueue.enqueue(async () => {
            const task = await TaskModel.findByPk(taskId);
            if (!task) {
                throw new Error(`Task ${taskId} not found`);
            }

            await task.update({
                status: TaskStatus.Cancelled
            });

            // Emit the 'taskCancelled' event with the task
            await this.asyncEmit('taskCancelled', task);

            // Check if this task has child projects and cancel their tasks
            if (task.props?.childProjectIds) {
                for (const childProjectId of task.props.childProjectIds) {
                    const childProject = await this.getProject(childProjectId);
                    if (childProject) {
                        // Cancel all tasks in the child project
                        const childTasks = await TaskModel.findAll({
                            where: {
                                projectId: childProjectId,
                                status: { [Op.ne]: TaskStatus.Cancelled }
                            }
                        });

                        for (const childTask of childTasks) {
                            await this.cancelTask(childTask.id);
                        }
                    }
                }
            }

            return TaskModel.mapToTask(task);
        });
    }

    async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
        return this.saveQueue.enqueue(async () => {
            const task = await TaskModel.findByPk(taskId);
            if (!task) {
                throw new Error(`Task ${taskId} not found`);
            }

            // Validate task properties
            if (updates.order !== undefined && typeof updates.order !== 'number') {
                throw new Error('Task order must be a number');
            }
            if (updates.complete !== undefined && typeof updates.complete !== 'boolean') {
                throw new Error('Task complete status must be a boolean');
            }

            // Update the task
            await task.update({
                ...updates,
                props: {
                    ...task.props,
                    ...updates.props,
                    updatedAt: new Date()
                }
            });

            // Emit taskUpdated event
            await this.asyncEmit('taskUpdated', {
                task,
                project: await ProjectModel.findByPk(task.projectId)
            });

            return TaskModel.mapToTask(task);
        });
    }

    async scheduleRecurringTask(taskId: string, nextRunDate?: Date): Promise<void> {
        return this.saveQueue.enqueue(async () => {
            const task = await TaskModel.findByPk(taskId);
            if (!task) {
                throw new Error(`Task ${taskId} not found`);
            }

            if (task.type !== TaskType.Recurring) {
                throw new Error('Task is not marked as recurring');
            }

            await task.update({
                lastRunDate: nextRunDate || new Date()
            });
        });
    }

    private async checkMissedTasks() {
        const now = Date.now();
        const lastCheck = this.lastCheckTime;
        this.lastCheckTime = now;

        // Find all tasks that need to be checked
        const tasks = await TaskModel.findAll({
            include: [{
                model: ProjectModel,
                as: 'project'
            }]
        });

        for (const task of tasks) {
            // Check for missed recurring tasks
            if (task.type === TaskType.Recurring && task.lastRunDate) {
                const lastRun = new Date(task.lastRunDate).getTime();
                let nextRun = lastRun;

                // Calculate when the next run should have been
                switch (task.recurrencePattern) {
                    case RecurrencePattern.Daily:
                        nextRun = new Date(task.lastRunDate).setHours(24, 0, 0, 0);
                        break;
                    case RecurrencePattern.Weekly:
                        nextRun = lastRun + (7 * 24 * 60 * 60 * 1000);
                        break;
                    case RecurrencePattern.Monthly:
                        const nextMonth = new Date(lastRun);
                        nextMonth.setMonth(nextMonth.getMonth() + 1);
                        nextRun = nextMonth.getTime();
                        break;
                }

                // If next run should have happened between last check and now
                if (nextRun > lastCheck && nextRun <= now) {
                    Logger.info(`Executing missed recurring task ${task.id} from ${new Date(nextRun).toISOString()}`);
                    await this.scheduleRecurringTask(task.id, new Date(nextRun));
                }
            }

            // Check for missed due dates on non-recurring tasks
            if (task.type !== TaskType.Recurring && task.props?.dueDate) {
                const dueDate = new Date(task.props.dueDate).getTime();
                if (dueDate <= now &&
                    task.status !== TaskStatus.Completed &&
                    task.status !== TaskStatus.Cancelled) {
                    Logger.info(`Task ${task.id} has missed its due date of ${new Date(dueDate).toISOString()}`);

                    // Emit event for missed due date
                    await this.asyncEmit('taskMissedDueDate', {
                        task,
                        project: task.project,
                        dueDate: new Date(dueDate)
                    });
                }
            }
        }
    }

    startScheduler() {
        // Check for missed tasks on startup
        this.checkMissedTasks().catch(err =>
            Logger.error('Error checking missed tasks:', err)
        );

        // Schedule regular checks
        cron.schedule('*/1 * * * *', async () => {
            try {
                await this.checkMissedTasks();
            } catch (err) {
                Logger.error('Error in scheduler:', err);
            }
        });
    }
}

export default SimpleTaskManager;
