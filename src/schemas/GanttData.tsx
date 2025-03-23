export interface GanttData {
    tasks: Array<{
        id: number;
        text: string;
        start: Date;
        end: Date;
        duration?: number;
        progress?: number;
        type?: 'task' | 'summary';
        parent?: number;
    }>;
    links?: Array<{
        id: number;
        source: number;
        target: number;
        type: string;
    }>;
    scales?: Array<{
        unit: string;
        step: number;
        format: string;
    }>;
}
