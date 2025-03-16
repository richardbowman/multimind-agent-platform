import { EventEmitter } from "events";
import Database from 'better-sqlite3';
import * as crypto from 'crypto';
import { AsyncQueue } from "../helpers/asyncQueue";
import * as path from 'path';
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import * as sqliteVec from "sqlite-vec";
import { IVectorDatabase, SearchResult } from "./IVectorDatabase";
import Logger from "../helpers/logger";
import { IEmbeddingService, ILLMService } from "./ILLMService";
import { getDataPath } from "src/helpers/paths";
import { asError } from "src/types/types";
import { createUUID, UUID } from "src/types/uuid";

const syncQueue = new AsyncQueue();

class SQLiteVecService extends EventEmitter implements IVectorDatabase {
    private db: Database.Database | null = null;
    private collectionName: string = '';
    private dimensions: number = 768; // Default embedding dimensions

    constructor(private embeddingService: IEmbeddingService, private llmService: ILLMService) {
        super();
    }

    async initializeCollection(name: string, dimensions?: number): Promise<void> {
        await syncQueue.enqueue(async () => {
            this.collectionName = name;
            this.dimensions = dimensions || this.dimensions;
            const dbPath = path.join(getDataPath(), `${name}.db`);
            
            // Initialize SQLite database with vector extension
            this.db = new Database(dbPath);
            sqliteVec.load(this.db);
            
            const { vec_version } = this.db
            .prepare("select vec_version() as vec_version;")
            .get();
          
            Logger.info(`SQLite-vec index initialized for collection: ${name} at ${dbPath} vec_version=${vec_version}`);
        });
    }

    async addDocuments(collection: { ids: string[], metadatas: any[], documents: string[] }): Promise<void> {
        if (!this.db) throw new Error("Database not initialized");

        const embedder = this.embeddingService.getEmbeddingModel();
        const embeddings = await embedder.generate(collection.documents);

        await syncQueue.enqueue(async () => {
            const insertStmt = this.db!.prepare(`
                INSERT OR REPLACE INTO vectors (id, vector, metadata, text)
                VALUES (?, ?, ?, ?)
            `);

            const insertIndexStmt = this.db!.prepare(`
                INSERT OR REPLACE INTO vec_index (rowid, vector, text, metadata)
                VALUES (?, ?, ?, ?)
            `);

            const transaction = this.db!.transaction((items) => {
                for (let i = 0; i < items.length; i++) {
                    const { id, vector, metadata, text } = items[i];
                    
                    // Insert into main vectors table
                    insertStmt.run(
                        id,
                        Buffer.from(new Float32Array(vector).buffer),
                        JSON.stringify(metadata),
                        text
                    );

                    // Insert into vector index
                    insertIndexStmt.run(
                        id,
                        vector,
                        text,
                        JSON.stringify(metadata)
                    );
                }
            });

            const items = collection.documents.map((doc, i) => ({
                id: collection.ids[i],
                vector: embeddings[i],
                metadata: collection.metadatas[i],
                text: doc
            }));

            transaction(items);
        });
    }

    async query(queryTexts: string[], where: any, nResults: number): Promise<SearchResult[]> {
        return syncQueue.enqueue(async () => {
            if (!this.db) throw new Error("Database not initialized");

            const embedder = this.embeddingService.getEmbeddingModel();
            const queryEmbeddings = await embedder.generate(queryTexts);
            const queryVector = queryEmbeddings[0];

            // Convert where clause to SQL conditions
            const conditions = Object.entries(where)
                .map(([key, value]) => `json_extract(metadata, '$.${key}') = ?`)
                .join(' AND ');

            const params = Object.values(where);

            const query = `
                SELECT 
                    rowid as id,
                    text,
                    metadata,
                    vec_distance(vector, ?) as score
                FROM vec_index
                ${conditions ? `WHERE ${conditions}` : ''}
                ORDER BY score ASC
                LIMIT ?
            `;

            const stmt = this.db!.prepare(query);
            const results = stmt.all([Buffer.from(new Float32Array(queryVector).buffer), ...params, nResults]);

            return results.map(result => ({
                id: result.id,
                text: result.text,
                metadata: JSON.parse(result.metadata),
                score: result.score
            }));
        });
    }

    computeHash(content: string): string {
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
        artifactId?: UUID
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

            const metadata = {
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
            };

            addCollection.metadatas.push(metadata);
            addCollection.documents.push(chunkContent);
        });

        await this.addDocuments(addCollection);
    }

    async clearCollection(): Promise<void> {
        await syncQueue.enqueue(async () => {
            if (!this.db) throw new Error("Database not initialized");

            // Drop and recreate tables
            this.db!.prepare('DROP TABLE IF EXISTS vectors').run();
            this.db!.prepare('DROP TABLE IF EXISTS vec_index').run();
            
            Logger.info("Cleared SQLite-vec collection");
        });
    }

    async reindexCollection(name: string): Promise<void> {
        await this.clearCollection();
        await this.initializeCollection(name);
    }

    async getTokenCount(content: string): Promise<number> {
        return this.llmService.countTokens(content);
    }

    async deleteDocuments(where: Record<string, any>): Promise<void> {
        await syncQueue.enqueue(async () => {
            if (!this.db) throw new Error("Database not initialized");

            // Convert where clause to SQL conditions
            const conditions = Object.entries(where)
                .map(([key, value]) => `json_extract(metadata, '$.${key}') = ?`)
                .join(' AND ');

            const params = Object.values(where);

            // Delete from main table
            this.db!.prepare(`
                DELETE FROM vectors
                WHERE ${conditions}
            `).run(params);

            // Delete from index
            this.db!.prepare(`
                DELETE FROM vec_index
                WHERE ${conditions}
            `).run(params);
        });
    }

    async getCollectionStats(): Promise<{ count: number, size: number }> {
        return syncQueue.enqueue(async () => {
            if (!this.db) throw new Error("Database not initialized");

            const countResult = this.db!.prepare('SELECT COUNT(*) as count FROM vectors').get();
            const sizeResult = this.db!.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get();

            return {
                count: countResult.count,
                size: sizeResult.size
            };
        });
    }
}

export default SQLiteVecService;
