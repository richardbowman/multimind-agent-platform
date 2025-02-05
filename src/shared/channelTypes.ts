import { UUID } from 'src/types/uuid';
import { ChatHandle } from 'src/types/chatHandle';
import { Task } from 'src/tools/taskManager';

export type ChannelHandle = string & { readonly __channelHandleBrand: unique symbol };
const CHANNEL_HANDLE_PATTERN = /^#[a-zA-Z0-9_-]+$/;

export function isChannelHandle(value: string): value is ChannelHandle {
    return CHANNEL_HANDLE_PATTERN.test(value);
}

export function createChannelHandle(value: string): ChannelHandle {
    if (!value.startsWith('#')) {
        value = '#' + value;
    }
    if (!isChannelHandle(value)) {
        throw new Error(`Invalid channel handle format: ${value}`);
    }
    return value as ChannelHandle;
}

export interface CreateChannelHandlerParams {
    name: ChannelHandle;
    description?: string;
    isPrivate?: boolean;
    members?: ChatHandle[];
    defaultResponder?: ChatHandle;
    projectId?: UUID;
    goalTemplate?: ChannelHandle;
    goalDescriptions?: string[];
    artifactIds?: UUID[];
}


export interface CreateChannelParams {
    name: ChannelHandle;
    description?: string;
    isPrivate?: boolean;
    members?: UUID[];
    defaultResponderId?: UUID;
    projectId?: UUID;
    goalTemplate?: ChannelHandle;
    artifactIds?: UUID[];
}

export interface ChannelData {
    id: UUID;
    name: ChannelHandle;
    projectId?: UUID;
    description?: string;
    isPrivate?: boolean;
    members?: UUID[];
    defaultResponderId?: string;
    artifactIds?: UUID[];
    goalTemplateId?: ChannelHandle;
}
