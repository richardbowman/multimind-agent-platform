export interface TaskProgress {
    taskId: string;
    status: "Not Started" | "In Progress" | "Blocked" | "Complete";
    analysis: string;
    nextSteps: string[];
    blockers?: string[];
}

export interface ReviewProgressResponse {
    progress: TaskProgress[];
    summary: string;
}
