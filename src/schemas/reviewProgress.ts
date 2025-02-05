/**
 * Represents the status of a task in the review process
 */
export type TaskReviewStatus = "Not Started" | "In Progress" | "Blocked" | "Complete";

/**
 * Interface for individual task progress details
 */
export interface TaskProgress {
    /**
     * Unique identifier of the task
     */
    taskId: string;

    /**
     * Current status of the task
     */
    status: TaskReviewStatus;

    /**
     * Detailed analysis of the task's current state
     */
    analysis: string;

    /**
     * List of recommended next steps
     */
    nextSteps: string[];

    /**
     * List of current blockers preventing progress
     */
    blockers?: string[];
}

/**
 * Interface for the complete review progress response
 */
export interface ReviewProgressResponse {
    /**
     * List of progress details for each task
     */
    progress: TaskProgress[];

    /**
     * Overall summary of the project's progress
     */
    summary: string;
}
