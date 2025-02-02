import { ChatHandle } from "src/types/chatHandle";
import { UUID } from "src/types/uuid";

export interface TaskCreationResponse {
    taskDescription: string;
    recurrencePattern: 'Daily' | 'Weekly' | 'Monthly' | 'One-time' | 'None';
    isRecurring: boolean;
    assignee: '@user' | ChatHandle; // Use string for chat handles
    agents: any[];
    responseMessage: string;
}
