import { ModelMessageResponse } from "./ModelResponse";

export interface OnboardingConsultantResponse extends ModelMessageResponse {
    completedTasks: string[];
}