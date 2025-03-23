import { ConversationContext } from "../chat/chatClient";
import { EventEmitter } from "events";
import { FilterCriteria } from "../types/FilterCriteria";

export interface SearchResult {
    id: string;
    text: string;
    metadata: Record<string, any>;
    score: number;
}

export interface IVectorDatabase extends EventEmitter {
    initializeCollection(name: string): Promise<void>;
    addDocuments(collection: { ids: string[], metadatas: any[], documents: string[] }): Promise<void>;
    query(queryTexts: string[], where: FilterCriteria, nResults: number): Promise<SearchResult[]>;
    handleContentChunks(
        content: string, 
        url: string, 
        task: string, 
        projectId: string, 
        title: string, 
        type?: string, 
        subtype?: string, 
        artifactId?: string
    ): Promise<void>;
    clearCollection(): Promise<void>;
    reindexCollection(): Promise<void>;
    getTokenCount(content: string): Promise<number>;
    deleteDocuments(where: FilterCriteria): Promise<void>;
}
