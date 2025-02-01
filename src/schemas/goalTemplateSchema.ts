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
export const GoalTemplates: GoalTemplate[] = [
    {
        id: createChannelHandle('#general'),
        name: 'Chat Channel',
        description: 'Template for setting up a chat channel with an AI assistant',
        supportingAgents: [createChatHandle('@ai')],
        defaultResponder: createChatHandle('@ai'),
        initialTasks: []
    },
    {
        id: createChannelHandle('#onboarding'),
        name: 'Onboarding Channel',
        description: 'Template for initializing an onboarding for new projects',
        supportingAgents: [
            createChatHandle('@onboarding')
        ],
        defaultResponder: createChatHandle('@onboarding'),
        initialTasks: [
            {
                description: 'Select an on-boarding template based on high-level goal',
                type: 'onboarding',
                metadata: {
                    agent: '@onboarding'
                }
            },
            {
                description: 'Generate an onboarding plan using the onboarding agent',
                type: 'onboarding',
                dependsOn: ['gather-existing-documents'],
                metadata: {
                    agent: '@onboarding'
                }
            },
            {
                description: 'Create necessary communication channels for usage based on the user goal',
                type: 'communication',
                dependsOn: ['generate-channel']
            }
        ]
    },
    {
        id: createChannelHandle('#product'),
        name: 'Software Development Project',
        description: 'Template for managing a software development project',
        supportingAgents: ["@product"],
        defaultResponder: "@product",
        initialTasks: [
            {
                description: 'Understand the product vision and product requirements to generate product requirements',
                type: 'planning',
            },
            {
                description: 'Understand desired technologies to use, and document a technical plan',
                type: 'setup',
                dependsOn: ['define-project-requirements']
            }
        ]
    },
    {
        id: '#marketing-campaign',
        name: 'Marketing Campaign',
        description: 'Template for running a marketing campaign',
        supportingAgents: [
            '@router',
            '@writer', // ContentWriter
            '@content', // ContentManager
            '@data', //data gatherer
            '@marketing' // marketing strategist
        ],
        defaultResponder: '@router',
        initialTasks: [
            {
                description: 'Share existing website content',
                type: 'data-gathering',
            },
            {
                description: 'Define campaign goals',
                type: 'planning',
            },
            {
                description: 'Create content calendar',
                type: 'planning',
                dependsOn: ['define-campaign-goals']
            }
        ]
    },
    {
        id: '#web-research',
        name: 'Web Research Channel',
        description: 'Template for setting up a web research channel with a research manager',
        supportingAgents: [
            '@research',
            '@research-assistant'
        ],
        defaultResponder: '@research',
        initialTasks: [
            {
                description: 'Define research goals and objectives',
                type: 'planning',
            },
            {
                description: 'Gather initial research data from web sources',
                type: 'data-gathering',
                dependsOn: ['define-research-goals']
            },
            {
                description: 'Analyze gathered data and generate insights',
                type: 'analysis',
                dependsOn: ['gather-initial-research-data']
            }
        ]
    }
];
