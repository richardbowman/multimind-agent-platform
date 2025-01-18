
import { UUID } from 'src/types/uuid';

export interface ClientTask {
    id: UUID;
    projectId: UUID;
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
    id: UUID;
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
}export interface ClientThread {
    rootMessage: ClientMessage;
    replies: ClientMessage[];
    last_message_at: number;
    channel_id: string;
}
export interface ClientChannel {
    id: string;
    name: string;
    description?: string;
    members: string[];
    projectId: string;
}
export interface ClientMessage {
    id: string;
    channel_id: string;
    thread_id?: UUID;
    message: string;
    user_id: string;
    create_at: number;
    directed_at?: string;
    props?: Record<string, any>;
    inProgress?: boolean;
    reply_count: number;

    getRootId(): string | null;
    isReply(): boolean;
    hasUUID(): boolean;
    getActivityType(): string | null;
}

