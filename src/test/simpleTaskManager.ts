import cron from 'node-cron';
import fs from 'fs/promises';
import * as Events from 'events';
import { AddTaskParams, CreateProjectParams, Project, ProjectMetadata, RecurrencePattern, RecurringTask, Task, TaskManager, TaskType } from '../tools/taskManager';
import { TaskStatus } from 'src/schemas/TaskStatus';
import Logger from 'src/helpers/logger';
import { ContentProject } from 'src/agents/contentManager';
import { AsyncQueue } from '../helpers/asyncQueue';
import { createUUID, UUID } from 'src/types/uuid';

class SimpleTaskManager extends Events.EventEmitter implements TaskManager {
    private projects: Record<UUID, Project> = {};
    private filePath: string;
    private savePending: boolean = false;
    private fileQueue: AsyncQueue = new AsyncQueue();
    private lastCheckTime: number = Date.now();

    constructor(filePath: string) {
        super();
        this.filePath = filePath;
        Logger.info("Starting task manager (should not happen more than once)");
        this.setMaxListeners(100);
    }

    async addTask(project: Project, addTask: AddTaskParams): Promise<Task> {
        const task = {
            id: createUUID(),
            category: "",
            status: TaskStatus.Pending,
            ...addTask,
            projectId: project.id
        }

        // Set order to be after existing tasks if not specified
        if (task.order === undefined) {
            const existingTasks = Object.values(this.projects[project.id].tasks || {});
            const maxOrder = Math.max(...existingTasks.map(t => t.order ?? 0), 0);
            task.order = maxOrder + 1;
        }

        // Emit taskAdded event before saving
        this.emit('taskAdded', { task, project });

        // If not explicitly set, make this task depend on the task with the next lowest order
        if (task.dependsOn === undefined) {
            const existingTasks = Object.values(this.projects[project.id].tasks || {});
            const previousTask = existingTasks
                .filter(t => (t.order ?? Infinity) < (task.order ?? Infinity))
                .sort((a, b) => (b.order ?? 0) - (a.order ?? 0))[0];

            if (previousTask) {
                task.dependsOn = previousTask.id;
            }
        }

        this.projects[project.id].tasks[task.id] = task;
        await this.save();
        return task;
    }

    newProjectId(): UUID {
        return createUUID();
    }

    async addProject(project: Partial<Project>): Promise<Project> {
        // Merge provided metadata with defaults
        const addProject: Project = {
            id: createUUID(),
            name: `Project created ${new Date()}`,
            tasks: {},
            ...project,
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                status: 'active',
                priority: 'medium',
                ...project.metadata // Spread existing metadata to override defaults
            }
        };

        this.projects[addProject.id] = addProject;
        await this.save();
        return addProject;
    }

    async createProject(params: CreateProjectParams): Promise<Project> {
        const project = {
            name: params.name,
            tasks: {},
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                status: "active",
                priority: "medium",
                ...params.metadata
            } as ProjectMetadata
        };

        const newProject = await this.addProject(project);

        if (params.tasks) {
            for (const task of params.tasks) {
                await this.addTask(newProject, {
                    id: createUUID(),
                    description: task.description,
                    type: task.type,
                    creator: 'system'
                });
            }
        }

        return newProject;
    }

    getProject(projectId: string): Project {
        return this.projects[projectId];
    }

    async save(): Promise<void> {
        try {
            if (this.savePending) return;
            this.savePending = true;
            await this.fileQueue.enqueue(async () => {
                await fs.writeFile(this.filePath, JSON.stringify(this.projects, null, 2));
                this.savePending = false;
            });
        } catch (error) {
            Logger.error('Failed to save tasks:', error);
            this.savePending = false;
        }
    }

    async load(): Promise<void> {
        try {
            await this.fileQueue.enqueue(async () => {
                const data = await fs.readFile(this.filePath, 'utf-8');
                this.projects = JSON.parse(data);
                Logger.info(`Loaded ${Object.keys(this.projects).length} projects from disk`);
            });
        } catch (error) {
            Logger.error('Failed to load tasks:', error);
        }
    }

    async assignTaskToAgent(taskId: string, assignee: string): Promise<void> {
        let taskFound = false;
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            if (project.tasks?.hasOwnProperty(taskId)) {
                const task = project.tasks[taskId];
                taskFound = true;
                const updatedTask = await this.updateTask(task.id, {
                    assignee
                })
                // Emit the 'taskAssigned' event with the task and agent ID
                this.emit('taskAssigned', updatedTask);
                break;
            }
        }
        if (!taskFound) {
            throw new Error(`Task with ID ${taskId} not found.`);
        }
    }

    async getNextTaskForUser(userId: string): Promise<Task | null> {
        const now = Date.now();
        
        for (const projectId in this.projects) {
            const project : Project = this.projects[projectId];
            const userTasks = Object.values<Task>(project.tasks || [])
                .filter(t => {
                    // Skip cancelled tasks
                    if (t.status === TaskStatus.Cancelled) {
                        return false;
                    }
                    
                    // Task must be assigned to user and pending
                    if (t.assignee !== userId || t.status !== TaskStatus.Pending) {
                        return false;
                    }

                    // If task has a due date, check if it's in the future
                    if (t.dueDate && new Date(t.dueDate).getTime() < now) {
                        return false;
                    }

                    // If task depends on another task, check if dependency is completed
                    if (t.dependsOn) {
                        const dependentTask = project.tasks[t.dependsOn];
                        if (dependentTask?.status !== TaskStatus.Completed) {
                            return false;
                        }
                    }

                    return true;
                })
                .sort((a, b) => {
                    // Sort by due date first (earlier dates first)
                    const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
                    const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
                    if (aDue !== bDue) {
                        return aDue - bDue;
                    }
                    // Then by order
                    return (a.order ?? Infinity) - (b.order ?? Infinity);
                });

            if (userTasks.length > 0) {
                return userTasks[0];
            }
        }
        return null;
    }

    async markTaskInProgress(task: Task | string): Promise<Task> {
        const taskId = typeof (task) === 'string' ? task : task.id;
        return this.updateTask(taskId, { 
            status: TaskStatus.InProgress,
            inProgress: true, // Maintain backwards compatibility
            complete: false // Maintain backwards compatibility
        });
    }

    async completeTask(id: string): Promise<Task> {
        const task = await this.updateTask(id, { 
            status: TaskStatus.Completed,
            complete: true, // Maintain backwards compatibility
            inProgress: false // Maintain backwards compatibility
        });
        // Emit the 'taskCompleted' event with the task
        this.emit('taskCompleted', task);

        // Find any tasks that were dependent on this one
        const project = this.getProject(task.projectId);
        const dependentTasks = Object.values(project.tasks || {})
            .filter(t => t.dependsOn === task.id && !t.complete);

        // Emit 'ready' event for each dependent task
        dependentTasks.forEach(dependentTask => {
            this.emit('taskReady', {
                task: dependentTask,
                project,
                dependency: task
            });
        });

        // Check if all tasks in the project are completed
        if (this.areAllTasksCompleted(task.projectId)) {
            this.emit('projectCompleted', { 
                project, 
                task, 
                creator: task.creator, 
                assignee: task.assignee 
            });
        }

        return task;
    }

    private areAllTasksCompleted(projectId: string): boolean {
        const project = this.projects[projectId];
        for (const taskId in project.tasks) {
            const task = project.tasks[taskId];
            if (task.status !== TaskStatus.Completed && !task.complete) {
                return false;
            }
        }
        return true;
    }

    getProjectByTaskId(taskId: string): Project {
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            if (project.tasks?.hasOwnProperty(taskId)) {
                return project;
            }
        }
        throw new Error(`No project found with task ID ${taskId}.`);
    }

    async replaceProject(project: ContentProject): Promise<void> {
        // Update metadata
        if (project.metadata) {
            project.metadata.updatedAt = new Date();
        }
        this.projects[project.id] = project;
        // Emit taskUpdated for each task in the project
        Object.values(project.tasks || {}).forEach(task => {
            this.emit('taskUpdated', { task, project });
        });
        await this.save();
    }

    getProjects(): Project[] {
        return Object.values(this.projects);
    }

    getNextTask(projectId: string): Task | null {
        const project = this.projects[projectId];
        if (!project) {
            return null;
        }

        // Get all tasks for the project
        const tasks : Task[] = Object.values(project.tasks || {});

        // Filter for not started tasks and sort by order
        const availableTasks = tasks
            .filter(t => (t.status === TaskStatus.Pending || t.status === TaskStatus.InProgress || !t.complete) && 
                        t.status !== TaskStatus.Cancelled)
            .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

        // Return the first task or null if none found
        return availableTasks[0] || null;
    }

    getAllTasks(projectId: string, type?: TaskType): Task[] {
        const project = this.projects[projectId];
        if (!project) {
            return [];
        }

        // Get all tasks and sort by order
        return Object.values<Task>(project.tasks || {})
            .filter(t => type ? t.type === type : true)
            .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    }

    getTaskById(taskId: string): Readonly<Task> | null {
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            if (project.tasks?.hasOwnProperty(taskId)) {
                // Return a deep frozen copy to prevent direct modification
                return Object.freeze(JSON.parse(JSON.stringify(project.tasks[taskId])));
            }
        }
        return null;
    }

    async updateProject(projectId: string, updates: Partial<Project>): Promise<Project> {
        if (!this.projects[projectId]) {
            throw new Error(`Project with ID ${projectId} not found`);
        }

        // Create updated project object
        const updatedProject = {
            ...this.projects[projectId],
            ...updates,
            // Ensure these properties can't be changed
            id: this.projects[projectId].id,
            // Update metadata timestamp
            metadata: {
                ...this.projects[projectId].metadata,
                ...updates.metadata,
                updatedAt: new Date()
            }
        };

        // Validate project properties
        if (updatedProject.name && typeof updatedProject.name !== 'string') {
            throw new Error('Project name must be a string');
        }

        // Update the project
        this.projects[projectId] = updatedProject;

        // Emit projectUpdated event
        this.emit('projectUpdated', { project: updatedProject });

        await this.save();
        return updatedProject;
    }

    async cancelTask(taskId: string): Promise<Task> {
        const task = await this.updateTask(taskId, { 
            status: TaskStatus.Cancelled,
            complete: false, // Maintain backwards compatibility
            inProgress: false // Maintain backwards compatibility
        });
        
        // Emit the 'taskCancelled' event with the task
        this.emit('taskCancelled', task);

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
                    type: existingTask.type
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
                this.emit('taskUpdated', { task: updatedTask, project });

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
                    if (dueDate > lastCheck && dueDate <= now && 
                        task.status !== TaskStatus.Completed && 
                        task.status !== TaskStatus.Cancelled) {
                        Logger.info(`Task ${taskId} has missed its due date of ${new Date(dueDate).toISOString()}`);
                        
                        // Emit event for missed due date
                        this.emit('taskMissedDueDate', { 
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
