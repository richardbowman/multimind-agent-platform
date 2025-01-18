import { UUID } from 'src/types/uuid';
import { ChatHandle } from 'src/types/chatHandle';


export interface CreateChannelHandlerParams {
    name: string;
    description?: string;
    isPrivate?: boolean;
    members?: (UUID | ChatHandle)[];
    defaultResponderId?: UUID | ChatHandle;
    projectId?: UUID;
    goalTemplate?: UUID;
    artifactIds?: UUID[];
}


export interface CreateChannelParams {
    name: string;
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
    members?: (UUID | ChatHandle)[];
    defaultResponderId?: string;
    artifactIds?: string[];
}
