export interface CreateChannelParams {
    name: string;
    description?: string;
    isPrivate?: boolean;
    members?: string[];
    defaultResponderId?: string;
    projectId?: string;
    goalTemplate?: string;
}

export interface ChannelData {
    id: string;
    name: string;
    members?: string[];
}
