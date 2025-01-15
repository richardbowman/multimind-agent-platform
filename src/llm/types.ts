export interface ModelInfo {
    id: string; // For local models: "local:filename.gguf", for remote: "repo/filename.gguf"
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
}
