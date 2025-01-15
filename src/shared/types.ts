export interface ClientTask {
    id: string;
    projectId: string;
    description: string;
    type: string;
    assignee?: string;
    inProgress?: boolean;
    complete?: boolean;
    threadId?: string;
    createdAt?: string;
    updatedAt?: string;
    dependsOn?: string;
    props?: {
        stepType?: string;
        [key: string]: any;
    };
}
