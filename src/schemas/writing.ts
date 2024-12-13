export interface ResearchFinding {
    finding: string;
    source: string;
}

export interface WritingSection {
    title: string;
    description: string;
    keyPoints: string[];
    researchFindings?: ResearchFinding[];
}

export interface WritingResponse {
    sections: WritingSection[];
}
