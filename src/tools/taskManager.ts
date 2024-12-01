import { EventEmitter } from 'events';

export interface Task {
    contentBlockId: any;
    creator: any;
    id: string;
    projectId: string;
    type: string;
    description: string;
    complete: boolean;
    assignee?: string;
}

export interface Project<Task> {
    id: string;
    name: string;
    tasks: Record<string, Task>;
}

export interface TaskManager extends EventEmitter {
    completeTask(id: string): Task;
    addProject(project: Project<Task>): void;
    addTask(project: Project<Task>, task: Task): void;
    getProject(projectId: string): Project<Task>;
    newProjectId(): string;
    save(): Promise<void>;
    load(): Promise<void>;
    assignTaskToAgent(taskId: string, agentId: string): void; // New method to assign a task to an agent
}