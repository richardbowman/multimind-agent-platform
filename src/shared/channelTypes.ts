export interface CreateChannelParams {
    name: string;
    description?: string;
    isPrivate?: boolean;
    members?: string[];
}
