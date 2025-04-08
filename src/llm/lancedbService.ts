import * as lancedb from "@lancedb/lancedb";
import * as arrow from 'apache-arrow';
import { AsyncQueue } from "../helpers/asyncQueue";
import * as path from 'path';
import { BaseVectorDatabase, IVectorDatabase, SearchResult } from "./IVectorDatabase";
import Logger from "../helpers/logger";
import { IEmbeddingService, ILLMService } from "./ILLMService";
import { getDataPath } from "src/helpers/paths";

const syncQueue = new AsyncQueue();

class LanceDBService extends BaseVectorDatabase implements IVectorDatabase {
    private db: lancedb.Connection | null = null;
    private table: lancedb.Table | null = null;
    private collectionName: string = '';

    constructor(private embeddingService: IEmbeddingService, private llmService: ILLMService) {
        super();
    }

    async initializeCollection(name: string): Promise<void> {
        await syncQueue.enqueue(async () => {
            this.collectionName = name;
            const dbPath = path.join(getDataPath(), 'lancedb');
            this.db = await lancedb.connect(dbPath);
            
            // Check if table exists
            const tables = await this.db.tableNames();
            if (tables.includes(name)) {
                this.table = await this.db.openTable(name);
            } else {
                // Create new table with simplified schema
                const schema = new arrow.Schema([
                    new arrow.Field('id', new arrow.Utf8()),
                    new arrow.Field('vector', new arrow.FixedSizeList(768, new arrow.Field("vector", new arrow.Float32()))),
                    new arrow.Field('text', new arrow.Utf8()),
                    new arrow.Field('type', new arrow.Utf8()),
                    new arrow.Field('subtype', new arrow.Utf8()),
                    new arrow.Field('artifactid', new arrow.Utf8()),
                    new arrow.Field('metadata_json', new arrow.Utf8())
                ]);

                // Create empty table with schema
                this.table = await this.db.createEmptyTable(name, schema, {
                    mode: 'overwrite'
                });
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
                type: collection.metadatas[i].type || '',
                subtype: collection.metadatas[i].subtype || '',
                artifactid: collection.metadatas[i].artifactid || '',
                metadata_json: JSON.stringify(collection.metadatas[i])
            }));

            await this.table.add(data);
        });
    }

    async query(queryTexts: string[], where: any, nResults: number): Promise<SearchResult[]> {
        return syncQueue.enqueue(async () => {
            if (!this.table) throw new Error("Table not initialized");

            const embedder = this.embeddingService.getEmbeddingModel();
            const queryEmbedding = (await embedder.generate(queryTexts))[0];
            const whereClause = where ? this.buildWhereClause(where) : "";

            let query = this.table.search(queryEmbedding).limit(nResults)
            if (whereClause.length > 0) {
                query = query.where(whereClause);
            }
            const results = await query.select(["id", "text", "metadata_json", "artifactid"]).toArray();

            return results.map((result: any) => ({
                id: result.id,
                text: result.text,
                metadata: JSON.parse(result.metadata_json),
                score: result._distance
            }));
        });
    }

    private buildWhereClause(where: any): string {
        const buildCondition = (key: string, value: any): string => {
            if (typeof value === 'object' && !Array.isArray(value)) {
                // Handle operators like $eq, $ne, $in, etc.
                const operator = Object.keys(value)[0];
                const val = value[operator];
                
                switch (operator) {
                    case '$eq':
                        return `${key} = '${val}'`;
                    case '$ne':
                        return `${key} != '${val}'`;
                    case '$in':
                        if (Array.isArray(val)) {
                            // Handle both string and non-string values properly
                            const values = val.map(v => 
                                typeof v === 'string' ? `'${v}'` : v
                            );
                            return `${key} IN (${values.join(', ')})`;
                        }
                        return `${key} = '${val}'`;
                    case '$nin':
                        if (Array.isArray(val)) {
                            return `${key} NOT IN (${val.map(v => `'${v}'`).join(', ')})`;
                        }
                        return `${key} != '${val}'`;
                    case '$gt':
                        return `${key} > ${val}`;
                    case '$gte':
                        return `${key} >= ${val}`;
                    case '$lt':
                        return `${key} < ${val}`;
                    case '$lte':
                        return `${key} <= ${val}`;
                    default:
                        return '';
                }
            }
            // Simple equality
            return `${key} = '${value}'`;
        };

        const buildClause = (clause: any): string => {
            if (clause.$and) {
                return `(${clause.$and.map(buildClause).join(' AND ')})`;
            }
            if (clause.$or) {
                return `(${clause.$or.map(buildClause).join(' OR ')})`;
            }
            if (clause.$not) {
                return `NOT (${buildClause(clause.$not)})`;
            }
            
            // Handle regular key-value pairs
            return Object.entries(clause)
                .map(([key, value]) => {
                    if (key === '$and' || key === '$or' || key === '$not') {
                        return '';
                    }
                    return buildCondition(key, value);
                })
                .filter(c => c)
                .join(' AND ');
        };

        return buildClause(where);
    }

    async clearCollection(): Promise<void> {
        await syncQueue.enqueue(async () => {
            if (this.table && this.db) {
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
        if (!this.table) throw new Error("Table not initialized");

        const whereClause = this.buildWhereClause(where);
        await this.table.delete(whereClause);
    }
}

export default LanceDBService;
