export interface Task {
    id: string;
    description: string;
    inProgress?: boolean;
    threadId?: string;
}
