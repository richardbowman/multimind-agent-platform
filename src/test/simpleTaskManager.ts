import cron from 'node-cron';
import fs from 'fs/promises';
import EventEmitter from 'events';
import { Project, RecurrencePattern, Task, TaskManager } from '../tools/taskManager';
import Logger from 'src/helpers/logger';
import { ContentProject } from 'src/agents/contentManager';

class SimpleTaskManager extends EventEmitter implements TaskManager {
    private projects: { [projectId: string]: Project<Task> } = {};
    private filePath: string;

    constructor(filePath: string) {
        super();
        this.filePath = filePath;
    }

    async addTask(project: Project<Task>, task: Task) : Promise<Task> {
        // Set order to be after existing tasks if not specified
        if (task.order === undefined) {
            const existingTasks = Object.values(this.projects[project.id].tasks || {});
            const maxOrder = Math.max(...existingTasks.map(t => t.order ?? 0), 0);
            task.order = maxOrder + 1;
        }

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

    async addProject(project: Project<Task>): Promise<void> {
        this.projects[project.id] = project;
        await this.save();
    }

    getProject(projectId: string): Project<Task> {
        return this.projects[projectId];
    }

    async save(): Promise<void> {
        try {
            await fs.writeFile(this.filePath, JSON.stringify(this.projects, null, 2));
        } catch (error) {
            Logger.error('Failed to save tasks:', error);
        }
    }

    async load(): Promise<void> {
        try {
            const data = await fs.readFile(this.filePath, 'utf-8');
            this.projects = JSON.parse(data);
            Logger.info(`Loaded ${Object.keys(this.projects).length} projects from disk`);
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
                    if (t.assignee !== userId || t.complete) {
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

    async completeTask(id: string): Promise<Task> {
        let taskFound = false;
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            if (project.tasks?.hasOwnProperty(id)) {
                const task = project.tasks[id];
                task.complete = true;
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

    getProjectByTaskId(taskId: string): Project<Task> {
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            if (project.tasks?.hasOwnProperty(taskId)) {
                return project;
            }
        }
        throw new Error(`No project found with task ID ${taskId}.`);
    }

    async replaceProject(project: ContentProject): Promise<void> {
        this.projects[project.id] = project;
        await this.save();
    }

    getProjects(): Project<Task>[] {
        return Object.values(this.projects);
    }

    // Method to handle recurring tasks
    async scheduleRecurringTask(taskId: string, nextRunDate?: Date): Promise<void> {
        let taskFound = false;
        for (const projectId in this.projects) {
            const project = this.projects[projectId];
            if (project.tasks?.hasOwnProperty(taskId)) {
                const task = project.tasks[taskId];
                if (!task.isRecurring) {
                    throw new Error('Task is not marked as recurring.');
                }
                // Optionally update the next run date
                if (nextRunDate) {
                    task.lastRunDate = nextRunDate;
                } else {
                    task.lastRunDate = new Date();
                }
                taskFound = true;
                await this.save();
                break;
            }
        }

        if (!taskFound) {
            throw new Error(`Task with ID ${taskId} not found.`);
        }
    }

    startScheduler() {
        // Schedule a job every day at midnight
        cron.schedule('0 0 * * *', async () => {
            for (const projectId in this.projects) {
                const project = this.projects[projectId];
                for (const taskId in project.tasks) {
                    const task = project.tasks[taskId];
                    if (task.isRecurring) {
                        const now = new Date();
                        switch (task.recurrencePattern) {
                            case RecurrencePattern.Daily:
                                // If the last run was yesterday, schedule the task again
                                if (new Date(task.lastRunDate!).setHours(0, 0, 0, 0) < new Date(now).setHours(0, 0, 0, 0)) {
                                    await this.scheduleRecurringTask(taskId, now);
                                }
                                break;
                            case RecurrencePattern.Weekly:
                                // If the last run was more than a week ago, schedule the task again
                                const weekFromLastRun = new Date(task.lastRunDate!);
                                weekFromLastRun.setDate(weekFromLastRun.getDate() + 7);
                                if (weekFromLastRun < now) {
                                    await this.scheduleRecurringTask(taskId, now);
                                }
                                break;

                            case RecurrencePattern.Monthly:
                                // If the last run was more than a month ago, schedule the task again
                                const monthFromLastRun = new Date(task.lastRunDate!);
                                monthFromLastRun.setMonth(monthFromLastRun.getMonth() + 1);
                                if (monthFromLastRun < now) {
                                    await this.scheduleRecurringTask(taskId, now);
                                }
                                break;
                        }
                    }
                }
            }
        });
    }
}

export default SimpleTaskManager;
