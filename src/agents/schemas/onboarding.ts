import { ModelResponse } from "./ModelResponse";

export interface OnboardingConsultantResponse extends ModelResponse {
    completedTasks: string[];
}