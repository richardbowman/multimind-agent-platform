import { EventEmitter } from 'events';
import { ContentProject } from 'src/agents/contentManager';

// Define a RecurrencePattern enum
export enum RecurrencePattern {
    Daily,
    Weekly,
    Monthly,
}

export interface Task {
    id: string;
    description: string;
    creator: string;
    assignee?: string;
    complete?: boolean;
    order?: number;  // Lower numbers come first
    dependsOn?: string;  // ID of the task that must complete before this one can start
}

export interface RecurringTask extends Task {
    isRecurring: boolean;
    recurrencePattern: RecurrencePattern;
    lastRunDate?: Date; // To keep track of the last run date
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
    addTask(project: Project<Task>, task: Task): Promise<Task>;
    getProject(projectId: string): Project<Task>;
    newProjectId(): string;
    save(): Promise<void>;
    load(): Promise<void>;
    assignTaskToAgent(taskId: string, agentId: string): void;
    getNextTaskForUser(userId: string): Promise<Task | null>;
    getProjects(): Project<Task>[];
}
