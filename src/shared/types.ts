
import { UUID } from 'src/types/uuid';

export interface ClientProject {
    id: UUID;
    name: string;
    props?: Record<string, any>;
    tasks: Task[];
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
import { ChatHandle } from 'src/types/chatHandle';
import { Task } from 'src/tools/taskManager';

export interface ClientMessage {
    id: string;
    channel_id: UUID;
    thread_id?: UUID;
    message: string;
    user_id: string;
    create_at: number;
    directed_at?: ChatHandle;
    props?: Record<string, any>;
    inProgress?: boolean;
    reply_count: number;

    getRootId(): string | null;
    isReply(): boolean;
    hasUUID(): boolean;
    getActivityType(): string | null;
}

