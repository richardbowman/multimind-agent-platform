export enum UpdateActions {
    Create = "create",
    Update = "update",
    Delete = "delete",
    Complete = 'complete'
}

export type TaskCreationResponseRecurrence = 'One-time' | 'Daily' | 'Weekly' | 'Monthly';

export interface TaskCreationResponse {
    action: UpdateActions,
    /** UUID of task to update/delete, blank if creating */
    taskId?: string;
    taskDescription: string;
    recurrencePattern: TaskCreationResponseRecurrence;
    /** The @user handle or agent handle starting with @ */
    assignee: string;
    /** Either a ISO-formatted Date/Time or a ISO Duration field */
    dueDate: string;

    /** deprecated */
    // responseMessage: string;
}
