import { EventEmitter } from "events";
import { connect } from "vectordb";
import * as crypto from 'crypto';
import { AsyncQueue } from "../helpers/asyncQueue";
import * as path from 'path';
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { IVectorDatabase, SearchResult } from "./IVectorDatabase";
import Logger from "../helpers/logger";
import { saveToFile } from "../tools/storeToFile";
import { IEmbeddingService, ILLMService } from "./ILLMService";
import { getDataPath } from "src/helpers/paths";
import { createUUID } from "src/types/uuid";

const syncQueue = new AsyncQueue();

class LanceDBService extends BaseVectorDatabase implements IVectorDatabase {
    private db: any;
    private table: any;
    private collectionName: string = '';

    constructor(private embeddingService: IEmbeddingService, private llmService: ILLMService) {
        super();
    }

    async initializeCollection(name: string): Promise<void> {
        await syncQueue.enqueue(async () => {
            this.collectionName = name;
            const dbPath = path.join(getDataPath(), 'lancedb');
            this.db = await connect(dbPath);
            
            // Check if table exists
            const tables = await this.db.tableNames();
            if (tables.includes(name)) {
                this.table = await this.db.openTable(name);
            } else {
                // Create new table with schema
                this.table = await this.db.createTable(name, [
                    { name: "id", type: "string" },
                    { name: "vector", type: new Float32Array() },
                    { name: "text", type: "string" },
                    { name: "metadata", type: "json" }
                ]);
            }
            Logger.info(`LanceDB collection initialized: ${name}`);
        });
    }

    async addDocuments(collection: { ids: string[], metadatas: any[], documents: string[] }): Promise<void> {
        if (!this.table) throw new Error("Table not initialized");

        const embedder = this.embeddingService.getEmbeddingModel();
        const embeddings = await embedder.generate(collection.documents);

        await syncQueue.enqueue(async () => {
            const data = collection.documents.map((doc, i) => ({
                id: collection.ids[i],
                vector: embeddings[i],
                text: doc,
                metadata: collection.metadatas[i]
            }));

            await this.table.add(data);
        });
    }

    async query(queryTexts: string[], where: any, nResults: number): Promise<SearchResult[]> {
        return syncQueue.enqueue(async () => {
            if (!this.table) throw new Error("Table not initialized");

            const embedder = this.embeddingService.getEmbeddingModel();
            const queryEmbedding = (await embedder.generate(queryTexts))[0];

            const results = await this.table.search(queryEmbedding)
                .limit(nResults)
                .where(where ? this.buildWhereClause(where) : undefined)
                .execute();

            return results.map((result: any) => ({
                id: result.id,
                text: result.text,
                metadata: result.metadata,
                score: result._distance
            }));
        });
    }

    private buildWhereClause(where: any): string {
        const conditions = Object.entries(where)
            .map(([key, value]) => {
                if (typeof value === 'string') {
                    return `metadata['${key}'] = '${value}'`;
                }
                return `metadata['${key}'] = ${value}`;
            })
            .join(' AND ');
        return conditions;
    }


    async clearCollection(): Promise<void> {
        await syncQueue.enqueue(async () => {
            if (this.table) {
                await this.db.dropTable(this.collectionName);
                Logger.info(`Cleared LanceDB collection: ${this.collectionName}`);
            }
            this.table = null;
        });
    }

    async reindexCollection(): Promise<void> {
        await this.clearCollection();
        await this.initializeCollection(this.collectionName);
    }

    async getTokenCount(content: string): Promise<number> {
        return this.llmService.countTokens(content);
    }

    async deleteDocuments(where: any): Promise<void> {
        await syncQueue.enqueue(async () => {
            if (!this.table) throw new Error("Table not initialized");

            const whereClause = this.buildWhereClause(where);
            await this.table.delete(whereClause);
        });
    }
}

export default LanceDBService;
