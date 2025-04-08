import { ChannelHandle } from "src/types/channelTypes";
import { ChatHandle } from "src/types/chatHandle";

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
     * Flag if this should be ignored
     */
    disabled: boolean;

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
