import { UUID } from 'src/types/uuid';

export interface CreateChannelParams {
    name: string;
    description?: string;
    isPrivate?: boolean;
import { ChatHandle } from 'src/types/chatHandle';

    members?: (string | ChatHandle)[];
    defaultResponderId?: string | ChatHandle;
    projectId?: string;
    goalTemplate?: string;
    artifactIds?: string[];
}

export interface ChannelData {
    id: UUID;
    name: string;
    projectId?: string;
    description?: string;
    isPrivate?: boolean;
    members?: string[];
    defaultResponderId?: string;
    artifactIds?: string[];
}
