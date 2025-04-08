export interface ModelInfo {
    id: string; // Format: "repo/filename.gguf"
    path?: string; // Local filesystem path
    name: string;
    size?: string;
    lastModified?: Date;
    repo?: string; // Repository name (e.g. "TheBloke")
    author?: string;
    downloads?: number;
    likes?: number;
    ggufFiles?: Array<{
        filename: string;
        size: string;
    }>;
}
