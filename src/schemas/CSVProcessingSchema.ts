export interface CSVProcessingResponse {
    projectName: string;
    taskDescription: string;
    assignedAgent: string;
    resultColumns: Array<{
        name: string;
        description: string
    }>;
}

export interface ExtractColumnsResponse {
    resultColumns: Array<{
        name: string;
        value: string;
    }>;
}
