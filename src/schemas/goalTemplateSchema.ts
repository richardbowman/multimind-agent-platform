export interface GoalTemplate {
    /**
     * Unique identifier for the goal template
     */
    id: string;
    
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
    supportingAgents: string[];
    
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
        id: 'welcome-channel',
        name: 'Welcome Channel Setup',
        description: 'Template for initializing a welcome channel and onboarding new users',
        supportingAgents: [
            'data', // Data agent
            'onboarding' // Onboarding agent
        ],
        initialTasks: [
            {
                description: 'Gather and analyze any existing documents using the data agent',
                type: 'data-collection',
                metadata: {
                    agent: 'data'
                }
            },
            {
                description: 'Generate an onboarding plan using the onboarding agent',
                type: 'onboarding',
                dependsOn: ['gather-existing-documents'],
                metadata: {
                    agent: 'onboarding'
                }
            },
            {
                description: 'Create personalized welcome message and platform introduction',
                type: 'communication',
                dependsOn: ['generate-onboarding-plan']
            }
        ]
    },
    {
        id: 'software-project',
        name: 'Software Development Project',
        description: 'Template for managing a software development project',
        supportingAgents: ['2e330aba-4888-42b8-8685-ecdc7f4b1b43'], // ProjectManager
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
        id: 'marketing-campaign',
        name: 'Marketing Campaign',
        description: 'Template for running a marketing campaign',
        supportingAgents: [
            '66025743-45bc-4625-a27f-52aa09dde128', // ContentWriter
            '9d039c4e-f99d-4fb7-a160-452ac261569c', // ContentManager
            'data-gather', //data gatherer
            'marketing-strategist' // marketing strategist
        ],
        initialTasks: [
            {
                description: 'Share existing website information with the agents',
                type: 'planning',
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
    }
];
