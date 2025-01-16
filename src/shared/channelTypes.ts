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
    id: string;
    name: string;
    projectId?: string;
    description?: string;
    isPrivate?: boolean;
    members?: string[];
    defaultResponderId?: string;
    artifactIds?: string[];
}
