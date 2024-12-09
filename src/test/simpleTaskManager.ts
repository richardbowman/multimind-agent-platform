import fs from 'fs/promises';
import EventEmitter from 'events';
import { Project, Task, TaskManager } from '../tools/taskManager';
import Logger from 'src/helpers/logger';
import { ContentProject } from 'src/agents/contentManager';

class SimpleTaskManager extends EventEmitter implements TaskManager {
    private projects: { [projectId: string]: Project<Task> } = {};
    private filePath: string;

    constructor(filePath: string) {
        super();
        this.filePath = filePath;
    }

    async addTask(project: Project<Task>, task: Task) {
        this.projects[project.id].tasks[task.id] = task;
        await this.save();
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
            const task = Object.values(project.tasks||[]).find(t => t.assignee === userId && !t.complete);
            if (task) {
                return task;
            }
        }
        Logger.info(`No tasks assigned to user ${userId} found.`);
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
}

export default SimpleTaskManager;
