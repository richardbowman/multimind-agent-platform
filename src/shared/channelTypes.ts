import { UUID } from 'src/types/uuid';

export interface CreateChannelParams {
    name: string;
    description?: string;
    isPrivate?: boolean;
    members?: string[];
    defaultResponderId?: string;
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
