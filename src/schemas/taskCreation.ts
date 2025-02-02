export interface TaskCreationResponse {
    taskDescription: string;
    recurrencePattern: 'Daily' | 'Weekly' | 'Monthly';
    responseMessage: string;
}
