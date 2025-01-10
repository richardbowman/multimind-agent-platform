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
        id: 'software-project',
        name: 'Software Development Project',
        description: 'Template for managing a software development project',
        supportingAgents: ['project-manager', 'code-reviewer', 'qa-tester'],
        initialTasks: [
            {
                description: 'Define project requirements',
                type: 'planning',
            },
            {
                description: 'Set up development environment',
                type: 'setup',
                dependsOn: ['define-project-requirements']
            }
        ]
    },
    {
        id: 'marketing-campaign',
        name: 'Marketing Campaign',
        description: 'Template for running a marketing campaign',
        supportingAgents: ['content-creator', 'analyst', 'social-media-manager'],
        initialTasks: [
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
