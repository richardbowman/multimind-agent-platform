export interface ModelInfo {
    id: string; // Format: "repo/filename.gguf" (for local models, repo is "local")
    path?: string; // Optional local filesystem path for local models
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
