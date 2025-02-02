export interface TaskCreationResponse {
    taskDescription: string;
    recurrencePattern: 'Daily' | 'Weekly' | 'Monthly' | 'None';
    isRecurring: boolean;
    assignee: UUID | 'user';
    responseMessage: string;
}
