export interface ClientTask {
    id: string;
    description: string;
    inProgress?: boolean;
    complete?: boolean;
    threadId?: string;
}
