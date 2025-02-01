import { ReasoningResponse } from "./ModelResponse";

export interface NextActionResponse extends ReasoningResponse {
    /** A supported action type */
    actionType: string;
    /** The goal for performing this actiom type */
    taskDescription: string;
    /** The sequence you are planning to follow (or "none") */
    sequence: string;
}
