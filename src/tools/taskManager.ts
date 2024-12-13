import { EventEmitter } from 'events';
import { ContentProject } from 'src/agents/contentManager';

// Define a RecurrencePattern enum
export enum RecurrencePattern {
    Daily,
    Weekly,
    Monthly,
}

export interface AddTaskParams {
    id: string;
    description: string;
    type: string;
    creator: string;
    assignee?: string;
    complete?: boolean;
    inProgress?: boolean;
    order?: number;
    dependsOn?: string;
    props?: Record<string, any>;
}

export interface Task extends AddTaskParams {
    id: string;
    projectId: string;
    description: string;
    type: string;
    creator: string;
    assignee?: string;
    complete?: boolean;
    inProgress?: boolean;
    order?: number;  // Lower numbers come first
    dependsOn?: string;  // ID of the task that must complete before this one can start
    props?: Record<string, any>;  // Flexible metadata field for storing step results etc
}

export interface RecurringTask extends Task {
    isRecurring: boolean;
    recurrencePattern: RecurrencePattern;
    lastRunDate?: Date; // To keep track of the last run date
}

export interface ProjectMetadata {
    createdAt: Date;
    updatedAt: Date;
    status: 'active' | 'completed' | 'archived';
    owner?: string;
    tags?: string[];
    description?: string;
    priority?: 'low' | 'medium' | 'high';
}

export interface Project<Task> {
    id: string;
    name: string;
    props?: Record<string, any>;
    tasks: Record<string, Task>;
    metadata: ProjectMetadata;
}

export interface TaskManager extends EventEmitter {
    replaceProject(project: Project<Task>): unknown;
    completeTask(id: string): Promise<Task>;
    addProject(project: Project<Task>): Promise<void>;
    addTask(project: Project<Task>, params: AddTaskParams): Promise<Task>;
    getProject(projectId: string): Project<Task>;
    newProjectId(): string;
    save(): Promise<void>;
    load(): Promise<void>;
    assignTaskToAgent(taskId: string, agentId: string): void;
    getNextTaskForUser(userId: string): Promise<Task | null>;
    getProjects(): Project<Task>[];
    getNextTask(projectId: string): Task | null;
    getAllTasks(projectId: string): Task[];
    markTaskInProgress(task: Task | string): Promise<Task>;
    getTaskById(taskId: string): Task | null;
}
