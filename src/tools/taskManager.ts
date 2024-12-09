import { EventEmitter } from 'events';
import { ContentProject } from 'src/agents/contentManager';

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
    props?: Record<string, any>;
    tasks: Record<string, Task>;
}

export interface TaskManager extends EventEmitter {
    replaceProject(project: Project<Task>): unknown;
    completeTask(id: string): Promise<Task>;
    addProject(project: Project<Task>): void;
    addTask(project: Project<Task>, task: Task): void;
    getProject(projectId: string): Project<Task>;
    newProjectId(): string;
    save(): Promise<void>;
    load(): Promise<void>;
    assignTaskToAgent(taskId: string, agentId: string): void;
    getNextTaskForUser(userId: string): Promise<Task | null>;
    getProjects(): Project<Task>[];
}
