import { ReasoningResponse } from "./ModelResponse";

export interface NextAction {
    actionType: string;
    taskDescription: string;
}

export interface NextActionResponse extends ReasoningResponse {
    action: NextAction;
}
