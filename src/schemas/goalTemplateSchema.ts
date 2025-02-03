import { ChannelHandle, createChannelHandle } from "src/shared/channelTypes";
import { ChatHandle, createChatHandle } from "src/types/chatHandle";
import { asUUID, UUID } from "src/types/uuid";

export interface GoalTemplate {
    /**
     * Unique identifier for the goal template
     */
    id: ChannelHandle;

    /**
     * Human-readable name of the goal template
     */
    name: string;

    /**
     * Description of the goal type and what it's used for
     */
    description: string;

    /**
     * List of agent IDs or types required to support this goal
     */
    supportingAgents: ChatHandle[];

    /**
     * Default responding agent ID or @handle for this goal template
     */
    defaultResponder?: ChatHandle;

    /**
     * Initial tasks to create when this goal template is selected
     */
    initialTasks: InitialTask[];
}

export interface InitialTask {
    /**
     * Task description
     */
    description: string;

    /**
     * Task type identifier
     */
    type: string;

    /**
     * Optional dependencies for task ordering
     */
    dependsOn?: string[];

    /**
     * Optional metadata for the task
     */
    metadata?: Record<string, any>;
}

/**
 * Predefined goal templates for common use cases
 */
import fs from 'fs';
import path from 'path';
import { createChannelHandle, createChatHandle } from "src/shared/channelTypes";

import { getDataPath } from '../helpers/paths';
const templatesDir = path.join(getDataPath(), 'goalTemplates');

export const GoalTemplates: GoalTemplate[] = fs.readdirSync(templatesDir)
    .filter(file => file.endsWith('.json'))
    .map(file => {
        const template = JSON.parse(fs.readFileSync(path.join(templatesDir, file), 'utf8'));
        return {
            ...template,
            id: createChannelHandle(template.id),
            supportingAgents: template.supportingAgents.map((agent: string) => createChatHandle(agent)),
            defaultResponder: template.defaultResponder ? createChatHandle(template.defaultResponder) : undefined
        };
    });
