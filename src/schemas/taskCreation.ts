export interface TaskCreationResponse {
    taskDescription: string;
    recurrencePattern: 'Daily' | 'Weekly' | 'Monthly' | 'One-time' | 'None';
    isRecurring: boolean;
    assignee: UUID | 'user';
    responseMessage: string;
}
