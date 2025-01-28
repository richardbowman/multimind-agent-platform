import { ChannelHandle, UUID } from 'src/types/uuid';
import { ChatHandle } from 'src/types/chatHandle';
import { Task } from 'src/tools/taskManager';


export interface CreateChannelHandlerParams {
    name: ChannelHandle;
    description?: string;
    isPrivate?: boolean;
    members?: (UUID | ChatHandle)[];
    defaultResponderId?: UUID | ChatHandle;
    projectId?: UUID;
    goalTemplate?: UUID;
    goalDescriptions?: String[];
    artifactIds?: UUID[];
}


export interface CreateChannelParams {
    name: ChannelHandle;
    description?: string;
    isPrivate?: boolean;
    members?: UUID[];
    defaultResponderId?: UUID;
    projectId?: UUID;
    goalTemplate?: UUID;
    artifactIds?: UUID[];
}

export interface ChannelData {
    id: UUID;
    name: string;
    projectId?: UUID;
    description?: string;
    isPrivate?: boolean;
    members?: UUID[];
    defaultResponderId?: string;
    artifactIds?: UUID[];
}
