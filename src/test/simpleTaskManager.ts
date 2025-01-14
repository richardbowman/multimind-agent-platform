import cron from 'node-cron';
import fs from 'fs/promises';
import * as Events from 'events';
import { CreateProjectParams, Project, ProjectMetadata, RecurrencePattern, RecurringTask, Task, TaskManager } from '../tools/taskManager';
import Logger from 'src/helpers/logger';
import { ContentProject } from 'src/agents/contentManager';
import { AsyncQueue } from '../helpers/asyncQueue';

class SimpleTaskManager extends Events.EventEmitter implements TaskManager {
    private projects: { [projectId: string]: Project } = {};
    private filePath: string;
    private savePending: boolean = false;
    private fileQueue: AsyncQueue = new AsyncQueue();
    private lastCheckTime: number = Date.now();

    constructor(filePath: string) {
        super();
        this.filePath = filePath;
        Logger.info("Starting task manager (should not happen more than once)");
    }

    async addTask(project: Project, task: Task): Promise<Task> {
        // Set project ID and order
        task.projectId = project.id;

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

    newProjectId(): string {
        return `project_${Date.now()}`;
    }

    async addProject(project: Partial<Project>): Promise<void> {
        // Merge provided metadata with defaults
        const addProject: Project = {
            ...project,
            metadata: {
                createdAt: new Date(),
                updatedAt: new Date(),
                status: 'active',
                priority: 'medium',
                ...project.metadata // Spread existing metadata to override defaults
            }
        };

        if (!project.id) {
            throw new Error("Project ID required to add project");
        } else {
            this.projects[project.id] = addProject;
            await this.save();
        }
    }

    async createProject(params: CreateProjectParams): Promise<Project> {
        const projectId = this.newProjectId();
        const project = {
            id: projectId,
            name: params.name,
            tasks: {},
            metadata: params.metadata
        };

        await this.addProject(project as Project);

        if (params.tasks) {
            for (const task of params.tasks) {
                await this.addTask(project as Project, {
                    id: crypto.randomUUID(),
                    description: task.description,
                    type: task.type,
                    creator: 'system',
                    projectId: projectId
                });
            }
        }

        return project;
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

    assignTaskToAgent(taskId: string, assignee: string): void {
        let taskFound = false;
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            if (project.tasks?.hasOwnProperty(taskId)) {
                const task = project.tasks[taskId];
                task.assignee = assignee;
                taskFound = true;
                // Emit the 'taskAssigned' event with the task and agent ID
                this.emit('taskAssigned', { task, assignee: assignee });
                break;
            }
        }
        if (!taskFound) {
            throw new Error(`Task with ID ${taskId} not found.`);
        }
    }

    async getNextTaskForUser(userId: string): Promise<Task | null> {
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            const userTasks = Object.values(project.tasks || [])
                .filter(t => {
                    // Task must be assigned to user and not complete
                    if (t.assignee !== userId || t.complete || t.inProgress) {
                        return false;
                    }

                    // If task depends on another task, check if dependency is complete
                    if (t.dependsOn) {
                        const dependentTask = project.tasks[t.dependsOn];
                        if (!dependentTask?.complete) {
                            return false;
                        }
                    }

                    return true;
                })
                .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

            if (userTasks.length > 0) {
                return userTasks[0];
            }
        }
        Logger.info(`No available tasks for user ${userId} found.`);
        return null;
    }

    async markTaskInProgress(task: Task | string): Promise<Task> {
        let taskFound = false;
        const taskId = typeof (task) === 'string' ? task : task.id;
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            if (project.tasks?.hasOwnProperty(taskId)) {
                const existingTask = project.tasks[taskId];
                existingTask.inProgress = true;
                taskFound = true;
                this.emit('taskInProgress', { task: existingTask });
                break;
            }
        }
        if (!taskFound) {
            throw new Error(`Task with ID ${taskId} not found.`);
        }
        await this.save();
        return this.getProjectByTaskId(taskId).tasks[taskId];
    }

    async completeTask(id: string): Promise<Task> {
        let taskFound = false;
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            if (project.tasks?.hasOwnProperty(id)) {
                const task = project.tasks[id];
                // Skip if task is already completed
                if (task.complete) {
                    return task;
                }
                task.complete = true;
                task.inProgress = false;
                taskFound = true;

                // Emit the 'taskCompleted' event with the completed task, creator, and assignee
                this.emit('taskCompleted', { task, creator: task.creator, assignee: task.assignee });

                // Check if all tasks in the project are completed
                if (this.areAllTasksCompleted(projectId)) {
                    this.emit('projectCompleted', { project, task, creator: task.creator, assignee: task.assignee });
                }
                break;
            }
        }
        if (!taskFound) {
            throw new Error(`Task with ID ${id} not found.`);
        }
        await this.save();
        return this.getProjectByTaskId(id).tasks[id];
    }

    private areAllTasksCompleted(projectId: string): boolean {
        const project = this.projects[projectId];
        for (const taskId in project.tasks) {
            if (!project.tasks[taskId].complete) {
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
        const tasks = Object.values(project.tasks || {});

        // Filter for not started tasks and sort by order
        const availableTasks = tasks
            .filter(t => !t.complete)
            .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

        // Return the first task or null if none found
        return availableTasks[0] || null;
    }

    getAllTasks(projectId: string): Task[] {
        const project = this.projects[projectId];
        if (!project) {
            return [];
        }

        // Get all tasks and sort by order
        return Object.values(project.tasks || {})
            .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    }

    getTaskById(taskId: string): Task | null {
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            if (project.tasks?.hasOwnProperty(taskId)) {
                return project.tasks[taskId];
            }
        }
        return null;
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
                if (!task.isRecurring || !task.lastRunDate) continue;

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
        }
    }

    startScheduler() {
        // Check for missed tasks on startup
        this.checkMissedTasks().catch(err =>
            Logger.error('Error checking missed tasks:', err)
        );

        // Schedule regular checks
        cron.schedule('*/5 * * * *', async () => {
            try {
                await this.checkMissedTasks();
            } catch (err) {
                Logger.error('Error in scheduler:', err);
            }
        });
    }
}

export default SimpleTaskManager;
