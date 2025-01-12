export interface CreateChannelParams {
    name: string;
    description?: string;
    isPrivate?: boolean;
    members?: string[];
    defaultResponderId?: string;
    projectId?: string;
}
