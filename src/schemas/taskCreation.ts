export interface TaskCreationResponse {
    taskDescription: string;
    recurrencePattern: 'Daily' | 'Weekly' | 'Monthly' | 'One-time' | 'None';
    isRecurring: boolean;
    assignee: UUID | 'user' | string; // Use string for chat handles
    agents: any[];
    responseMessage: string;
}
