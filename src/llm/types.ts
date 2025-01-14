export interface ModelInfo {
    id: string;
    name: string;
    path?: string;
    size: string;
    lastModified: Date;
    isLocal: boolean;
    author?: string;
    downloads?: number;
    likes?: number;
    ggufFiles?: Array<{
        filename: string;
        size: string;
    }>;
    // For local models, combines repo and filename
    combinedId?: string;
}
