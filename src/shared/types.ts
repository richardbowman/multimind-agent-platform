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

export interface ClientProject {
    id: string;
    name: string;
    props?: Record<string, any>;
    tasks: ClientTask[];
    metadata: {
        createdAt: Date;
        updatedAt: Date;
        status: 'active' | 'completed' | 'archived';
        owner?: string;
        tags?: string[];
        description?: string;
        priority?: 'low' | 'medium' | 'high';
        originalPostId?: string;
        parentTaskId?: any;
    };
}
