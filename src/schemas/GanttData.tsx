/**
 * Represents data for a Gantt chart visualization
 * @property {Array<GanttTask>} tasks - Array of tasks to display
 * @property {Array<GanttLink>} [links] - Optional array of dependency links between tasks
 * @property {Array<GanttScale>} [scales] - Optional array of time scales for the chart
 */
export interface GanttData {
    tasks: Array<{
        /**
         * Unique numeric ID for the task
         */
        id: number;
        /**
         * Task name or description
         */
        text: string;
        /**
         * Start date in ISO format (YYYY-MM-DDTHH:mm:ssZ)
         */
        start: Date;
        /**
         * End date in ISO format (YYYY-MM-DDTHH:mm:ssZ)
         */
        end: Date;
        /**
         * Duration in days
         */
        duration?: number;
        /**
         * Progress percentage (0-100)
         */
        progress?: number;
        /**
         * Task type - 'task' for regular tasks, 'summary' for parent tasks
         */
        type?: 'task' | 'summary';
        /**
         * Parent task ID for subtasks
         */
        parent?: number;
    }>;
    links?: Array<{
        /**
         * Unique numeric ID for the link
         */
        id: number;
        /**
         * Source task ID
         */
        source: number;
        /**
         * Target task ID
         */
        target: number;
        /**
         * Dependency type between tasks
         * @enum {string} - Possible values: 'e2e', 's2s', 'f2f', 's2f'
         */
        type: string;
    }>;
    scales?: Array<{
        /**
         * Time unit for the scale
         * @enum {string} - Possible values: 'year', 'month', 'week', 'day', 'hour'
         */
        unit: string;
        /**
         * Step size for the time unit
         */
        step: number;
        /**
         * Date format string
         */
        format: string;
    }>;
}
