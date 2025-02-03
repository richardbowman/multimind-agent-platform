import { ChatHandle } from "src/types/chatHandle";
import { UUID } from "src/types/uuid";

export enum UpdateActions {
    Create = "create",
    Update = "update",
    Delete = "delete"
}

export interface TaskCreationResponse {
    action: UpdateActions,
    taskId: number;
    taskDescription: string;
    recurrencePattern: 'Daily' | 'Weekly' | 'Monthly' | 'One-time' | 'None';
    isRecurring: boolean;
    assignee: '@user' | ChatHandle; // Use string for chat handles
    agents: any[];
    responseMessage: string;
}
