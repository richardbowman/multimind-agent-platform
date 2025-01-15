export interface ModelInfo {
    id: string; // Format: "repo/filename.gguf"
    path?: string; // Local filesystem path
    name: string;
    size: string;
    lastModified: Date;
    isLocal: boolean;
    repo: string; // Repository name (e.g. "TheBloke", "local")
    author?: string;
    downloads?: number;
    likes?: number;
    ggufFiles?: Array<{
        filename: string;
        size: string;
    }>;
}
