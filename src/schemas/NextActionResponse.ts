import { ReasoningResponse } from "./ModelResponse";

export interface NextAction {
    actionType: string;
    parameters: string;
}

export interface NextActionResponse extends ReasoningResponse {
    action: NextAction;
}
