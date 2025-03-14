export interface ResearchFinding {
    finding: string;
    source: string;
}

export interface WritingSection {
    /* A complete standalone description of the required task including precision on content structure and output format expectations */
    taskGoal: string;
    /* Section title */
    title: string;
    /* Section description */
    description: string;
    /* Other specific instructions to include, including key points to cover, research to reference, etc. */
    instructions: string[];
}

export interface WritingResponse {
    sections: WritingSection[];
}
