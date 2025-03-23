import { EventEmitter } from "events";
import { FilterCriteria } from "../types/FilterCriteria";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import * as crypto from 'crypto';
import { createUUID } from "src/types/uuid";

export interface SearchResult {
    id: string;
    text: string;
    metadata: Record<string, any>;
    score: number;
}

export abstract class BaseVectorDatabase extends EventEmitter {
    protected computeHash(content: string): string {
        const hash = crypto.createHash('sha256');
        hash.update(content);
        return hash.digest('hex');
    }

    async handleContentChunks(
        content: string,
        url: string,
        task: string,
        projectId: string,
        title: string,
        type = 'content',
        subtype: string,
        artifactId?: string
    ): Promise<void> {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 2000,
            chunkOverlap: 100,
        });

        const docId = artifactId || createUUID();
        const chunks = await splitter.createDocuments([content]);

        const addCollection: { ids: string[], metadatas: any[], documents: string[] } = {
            ids: [],
            metadatas: [],
            documents: []
        };

        chunks.forEach((c, index) => {
            const chunkContent = c.pageContent;
            const hashId = this.computeHash(chunkContent);

            if (addCollection.ids.includes(hashId)) return;

            addCollection.ids.push(hashId);
            addCollection.metadatas.push({
                url,
                projectId,
                type,
                subtype,
                task,
                title,
                docId,
                chunkId: index + 1,
                chunkTotal: chunks.length,
                artifactId
            });
            addCollection.documents.push(chunkContent);
        });

        await this.addDocuments(addCollection);
    }
}

export interface IVectorDatabase extends BaseVectorDatabase {
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
