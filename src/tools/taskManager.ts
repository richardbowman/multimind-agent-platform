import { EventEmitter } from 'events';
import { ContentProject } from 'src/agents/contentManager';

// Define a RecurrencePattern enum
export enum RecurrencePattern {
    Daily,
    Weekly,
    Monthly,
}

export enum TaskType {
    Standard = "standard",
    Recurring = "recurring",
    Step = "step",
    Goal = "goal"
}

import { UUID } from 'src/types/uuid';
import { TaskStatus } from '../schemas/TaskStatus';

export interface AddTaskParams {
    id?: UUID;
    description: string;
    type?: TaskType;    // will default to Standard
    category?: string;
    creator: UUID|'system';
    assignee?: UUID;
    status?: TaskStatus;
    /** @deprecated Use status field instead */
    complete?: boolean;
    /** @deprecated Use status field instead */
    inProgress?: boolean;
    order?: number;
    dependsOn?: UUID;
    props?: TaskMetadata;
}

export interface TaskMetadata extends Readonly<Record<string, any>> {
    readonly childProjectId?: UUID;
    readonly attachedArtifactIds?: UUID[];
    readonly dueDate?: Date;
    readonly announceChannelId?: UUID;
}

export interface Task extends Readonly<AddTaskParams> {
    readonly id: UUID;
    readonly projectId: UUID;
    readonly description: string;
    readonly type: TaskType;
    readonly category: string;
    readonly creator: UUID|'system';
    readonly assignee?: UUID;
    readonly status: TaskStatus;
    /** @deprecated Use status field instead */
    readonly complete?: boolean;
    /** @deprecated Use status field instead */
    readonly inProgress?: boolean;
    readonly order?: number;  // Lower numbers come first
    readonly dependsOn?: UUID;  // ID of the task that must complete before this one can start
    readonly props?: TaskMetadata;  // Flexible metadata field for storing step results etc
}

export interface RecurringTask extends Task {
    type: TaskType.Recurring,
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
    originalPostId?: UUID;
    parentTaskId?: UUID;
    parentProjectId?: UUID;
    childProjectId?: UUID;
    contentArtifactId?: UUID;
}

export interface Project {
    id: UUID;
    name: string;
    props?: Record<string, any>;
    tasks: Record<string, Task>;
    metadata: ProjectMetadata;
}

export interface CreateProjectParams {
    name: string;
    tasks?: { description: string; type: TaskType }[];
    metadata?: Partial<ProjectMetadata>;
}

export interface TaskManager extends EventEmitter {
    replaceProject(project: Project): unknown;
    completeTask(id: UUID): Promise<Task>;
    cancelTask(id: UUID): Promise<Task>;
    addProject(project: Partial<Project>): Promise<Project>;
    createProject(params: CreateProjectParams): Promise<Project>;
    addTask(project: Project, params: AddTaskParams): Promise<Task>;
    getProject(projectId: UUID): Promise<Project>;
    newProjectId(): UUID;
    save(): Promise<void>;
    load(): Promise<void>;
    assignTaskToAgent(taskId: UUID, agentId: string): Promise<Task>;
    getNextTaskForUser(userId: string): Promise<Task | null>;
    getProjects(): Promise<Project[]>;
    getNextTask(projectId: UUID, type?: TaskType): Promise<Task | null>;
    getProjectTasks(projectId: string): Promise<Task[]>;
    markTaskInProgress(task: Task | string): Promise<Task>;
    getTaskById(taskId: UUID): Promise<Readonly<Task> | null>;
    updateTask(taskId: UUID, updates: Partial<Task>): Promise<Task>;
    updateProject(projectId: string, updates: Partial<Project>): Promise<Project>;
}
