
export interface LogEntry {
    timestamp: string;
    level: string;
    message: string;
}

export interface LogReader {
    getLogs(params: {
        limit?: number;
        offset?: number;
        filter?: {
            level?: string[];
            search?: string;
            startTime?: number;
            endTime?: number;
        };
    }): { logs: LogEntry[]; total: number }   
}