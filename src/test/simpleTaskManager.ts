import cron from 'node-cron';
import * as Events from 'events';
import { AddTaskParams, CreateProjectParams, Project, ProjectMetadata, RecurrencePattern, RecurringTask, Task, TaskManager, TaskType } from '../tools/taskManager';
import { TaskStatus } from 'src/schemas/TaskStatus';
import Logger from 'src/helpers/logger';
import { AsyncQueue } from '../helpers/asyncQueue';
import { createUUID, UUID } from 'src/types/uuid';
import { Sequelize } from 'sequelize';
import { TaskModel, ProjectModel } from '../tools/taskModels';
import { DatabaseMigrator } from 'src/database/migrator';

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

        // Initialize models
        TaskModel.initialize(this.sequelize);
        ProjectModel.initialize(this.sequelize);
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        // Ensure the .output directory exists and run migrations
        await this.saveQueue.enqueue(async () => {
            await fs.mkdir(getDataPath(), { recursive: true });
            await this.migrator.migrate();
        }).catch(err => Logger.error('Error initializing database:', err));

        // Wait for initial migration to complete
        await this.sequelize.sync();

        this.initialized = true;
    }

    async addTask(project: Project, addTask: AddTaskParams): Promise<Task> {
        return this.saveQueue.enqueue(async () => {
            // Get max order for new task
            const maxOrder = await TaskModel.max('order', {
                where: { projectId: project.id }
            }) || 0;

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

            return task;
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

            return newProject;
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
                    await this.addTask(project, {
                        id: createUUID(),
                        description: task.description,
                        type: task.type,
                        creator: 'system'
                    });
                }
            }

            return project;
        });
    }

    async getProject(projectId: string): Promise<Project> {
        const project = await ProjectModel.findByPk(projectId, {
            include: [TaskModel]
        });

        if (!project) {
            throw new Error(`Project ${projectId} not found`);
        }

        return project;
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
                include: [ProjectModel]
            });

            // Filter and sort tasks
            const eligibleTasks = tasks
                .filter(task => {
                    // Skip if due date is in future
                    if (task.props?.dueDate && new Date(task.props.dueDate).getTime() > now) {
                        return false;
                    }

                    // Check dependencies if they exist
                    if (task.dependsOn) {
                        const dependentTask = await TaskModel.findByPk(task.dependsOn);
                        if (!dependentTask || dependentTask.status !== TaskStatus.Completed) {
                            return false;
                        }
                    }

                    return true;
                })
                .sort((a, b) => {
                    // Sort by due date first
                    const aDue = a.props?.dueDate ? new Date(a.props.dueDate).getTime() : Infinity;
                    const bDue = b.props?.dueDate ? new Date(b.props.dueDate).getTime() : Infinity;
                    if (aDue !== bDue) {
                        return aDue - bDue;
                    }
                    // Then by order
                    return (a.order ?? Infinity) - (b.order ?? Infinity);
                });

            return eligibleTasks[0] || null;
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
                return existingTask;
            }
            if (existingTask.status === TaskStatus.Cancelled) {
                Logger.warn(`Trying to start task ${taskId} which is cancelled`, new Error());
                return existingTask;
            }

            await existingTask.update({ 
                status: TaskStatus.InProgress,
                inProgress: true, // Maintain backwards compatibility
                complete: false // Maintain backwards compatibility
            });

            return existingTask;
        });
    }

    private async asyncEmit(eventName, ...eventArgs) {
        // Emit the 'taskCompleted' event with the task
        const listeners = this.listeners(eventName);
        Logger.verbose(`Calling event listener ${eventName}`);
        for(const listener of listeners) {
            try {
                await listener.apply(this, eventArgs);
            } catch (e) {
                Logger.error(`Error running event listener in task manager`, e);
            }
        }
    }

    async completeTask(id: string): Promise<Task> {
        return this.saveQueue.enqueue(async () => {
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
                status: TaskStatus.Completed,
                complete: true, // Maintain backwards compatibility
                inProgress: false // Maintain backwards compatibility
            });
            
            await this.asyncEmit("taskCompleted", existingTask);

            // Find any tasks that were dependent on this one
            const dependentTasks = await TaskModel.findAll({
                where: {
                    dependsOn: existingTask.id,
                    status: { [Sequelize.Op.ne]: TaskStatus.Completed }
                }
            });

            // Emit 'ready' event for each dependent task
            for(const dependentTask of dependentTasks) {
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
        });
    }

    private async areAllTasksCompleted(projectId: string): Promise<boolean> {
        const incompleteTasks = await TaskModel.count({
            where: {
                projectId,
                [Sequelize.Op.or]: [
                    { status: { [Sequelize.Op.ne]: TaskStatus.Completed } },
                    { complete: false }
                ]
            }
        });

        return incompleteTasks === 0;
    }

    async getProjectByTaskId(taskId: string): Promise<Project> {
        const task = await TaskModel.findByPk(taskId, {
            include: [ProjectModel]
        });
        
        if (!task || !task.project) {
            throw new Error(`No project found with task ID ${taskId}`);
        }
        
        return task.project;
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
        return ProjectModel.findAll({
            include: [TaskModel]
        });
    }

    async getNextTask(projectId: string): Promise<Task | null> {
        const tasks = await TaskModel.findAll({
            where: {
                projectId,
                [Sequelize.Op.or]: [
                    { status: TaskStatus.Pending },
                    { status: TaskStatus.InProgress },
                    { complete: false }
                ],
                status: { [Sequelize.Op.ne]: TaskStatus.Cancelled }
            },
            order: [['order', 'ASC']],
            limit: 1
        });

        return tasks[0] || null;
    }

    async getProjectTasks(projectId: string, type?: TaskType): Promise<Task[]> {
        const where: any = { projectId };
        if (type) {
            where.type = type;
        }

        return TaskModel.findAll({
            where,
            order: [['order', 'ASC']]
        });
    }

    async getTaskById(taskId: string): Promise<Readonly<Task> | null> {
        const task = await TaskModel.findByPk(taskId);
        if (!task) {
            return null;
        }
        // Return a deep frozen copy to prevent direct modification
        return Object.freeze(JSON.parse(JSON.stringify(task)));
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

            return project;
        });
    }

    async cancelTask(taskId: string): Promise<Task> {
        const task = await this._updateTask(taskId, { 
            status: TaskStatus.Cancelled,
            complete: false, // Maintain backwards compatibility
            inProgress: false // Maintain backwards compatibility
        }, false);
        
        // Emit the 'taskCancelled' event with the task
        await this.asyncEmit('taskCancelled', task);

        // Check if this task has child projects and cancel their tasks
        if (task.props?.childProjectIds) {
            for (const childProjectId of task.props.childProjectIds) {
                const childProject = this.getProject(childProjectId);
                if (childProject) {
                    // Cancel all tasks in the child project
                    for (const childTask of Object.values(childProject.tasks)) {
                        if (childTask.status !== TaskStatus.Cancelled) {
                            await this.cancelTask(childTask.id);
                        }
                    }
                }
            }
        }
        
        return task;
    }

    async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
        return this._updateTask(taskId, updates);
    }

    protected async _updateTask(taskId: string, updates: Partial<Task>, fireEvent: boolean = true): Promise<Task> {
        let taskFound = false;
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            if (project.tasks?.hasOwnProperty(taskId)) {
                const existingTask = project.tasks[taskId];
                
                // Create updated task object
                const updatedTask = {
                    ...existingTask,
                    ...updates,
                    // Ensure these properties can't be changed
                    id: existingTask.id,
                    projectId: existingTask.projectId,
                    type: existingTask.type,
                    props: {
                        ...existingTask.props,
                        ...updates.props,
                        updatedAt: new Date()
                    }
                };

                // Validate task properties
                if (updatedTask.order !== undefined && typeof updatedTask.order !== 'number') {
                    throw new Error('Task order must be a number');
                }
                if (updatedTask.complete !== undefined && typeof updatedTask.complete !== 'boolean') {
                    throw new Error('Task complete status must be a boolean');
                }

                // Update the task
                project.tasks[taskId] = updatedTask;
                taskFound = true;

                // Emit taskUpdated event
                await this.asyncEmit('taskUpdated', { task: updatedTask, project });

                await this.save();
                return updatedTask;
            }
        }

        throw new Error(`Task with ID ${taskId} not found`);
    }

    // Method to handle recurring tasks
    async scheduleRecurringTask(taskId: string, nextRunDate?: Date): Promise<void> {
        let taskFound = false;
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            if (project.tasks?.hasOwnProperty(taskId)) {
                if (project.tasks[taskId].type === "recurring") {
                    const task = project.tasks[taskId] as RecurringTask;
                    // Optionally update the next run date
                    if (nextRunDate) {
                        task.lastRunDate = nextRunDate;
                    } else {
                        task.lastRunDate = new Date();
                    }
                    taskFound = true;
                    await this.save();
                    break;
                } else {
                    throw new Error('Task is not marked as recurring.');
                }
            }

            if (!taskFound) {
                throw new Error(`Task with ID ${taskId} not found.`);
            }
        }
    }

    private async checkMissedTasks() {
        const now = Date.now();
        const lastCheck = this.lastCheckTime;
        this.lastCheckTime = now;

        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            for (const taskId in project.tasks) {
                const task = project.tasks[taskId];
                
                // Check for missed recurring tasks
                if (task.isRecurring && task.lastRunDate) {
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
                        Logger.info(`Executing missed recurring task ${taskId} from ${new Date(nextRun).toISOString()}`);
                        await this.scheduleRecurringTask(taskId, new Date(nextRun));
                    }
                }

                // Check for missed due dates on non-recurring tasks
                if (!task.isRecurring && task.dueDate) {
                    const dueDate = new Date(task.dueDate).getTime();
                    if (dueDate <= now && 
                        task.status !== TaskStatus.Completed && 
                        task.status !== TaskStatus.Cancelled) {
                        Logger.info(`Task ${taskId} has missed its due date of ${new Date(dueDate).toISOString()}`);
                        
                        // Emit event for missed due date
                        await this.asyncEmit('taskMissedDueDate', { 
                            task, 
                            project,
                            dueDate: new Date(dueDate) 
                        });
                    }
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
