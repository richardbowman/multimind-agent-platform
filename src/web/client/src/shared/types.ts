export interface ClientTask {
    id: string;
    description: string;
    inProgress?: boolean;
    threadId?: string;
}
