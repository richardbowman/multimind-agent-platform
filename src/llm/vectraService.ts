import { EventEmitter } from "events";
import { LocalIndex } from "vectra";
import crypto from 'crypto';
import { AsyncQueue } from "../helpers/asyncQueue";
import path from 'path';
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import LMStudioService from "./lmstudioService";
import { IVectorDatabase, SearchResult } from "./IVectorDatabase";
import Logger from "../helpers/logger";
import { saveToFile } from "../tools/storeToFile";
import { ConversationContext } from "../chat/chatClient";

const syncQueue = new AsyncQueue();

class VectraService extends EventEmitter implements IVectorDatabase {
    private index: LocalIndex | null = null;
    private lmStudioService: LMStudioService;
    private collectionName: string = '';

    constructor(lmStudioService: LMStudioService) {
        super();
        this.lmStudioService = lmStudioService;
    }

    async initializeCollection(name: string): Promise<void> {
        await syncQueue.enqueue(async () => {
            this.collectionName = name;
            const indexPath = path.join(process.cwd(), 'data', 'vectra', name);
            this.index = new LocalIndex(indexPath);
            
            if (!(await this.index.isIndexCreated())) {
                await this.index.createIndex();
            }
            
            Logger.info(`Vectra index initialized for collection: ${name} at ${indexPath}`);
        });
    }

    async addDocuments(collection: { ids: string[], metadatas: any[], documents: string[] }): Promise<void> {
        if (!this.index) throw new Error("Index not initialized");

        const embedder = this.lmStudioService.getEmbeddingModel();
        const embeddings = await embedder.generate(collection.documents);
        
        await this.index.beginUpdate();

        // Process inserts sequentially through the queue
        for (let i = 0; i < collection.documents.length; i++) {
            await syncQueue.enqueue(async () => {
                try {
                    await this.index!.insertItem({
                        id: collection.ids[i],
                        vector: embeddings[i],
                        metadata: {
                            ...collection.metadatas[i],
                            text: collection.documents[i]
                        }
                    });
                } catch (error) {
                    // Skip if item already exists
                    if (error.message?.includes('already exists')) {
                        Logger.warn(`Skipping duplicate item with id ${collection.ids[i]}`);
                    } else {
                        throw error; // Re-throw other errors
                    }
                }
            });
        }

        await this.index.endUpdate();
    }

    async query(queryTexts: string[], where: any, nResults: number): Promise<SearchResult[]> {
        return syncQueue.enqueue(async () => {
            if (!this.index) throw new Error("Index not initialized");

            const embedder = this.lmStudioService.getEmbeddingModel();
            const queryEmbeddings = await embedder.generate(queryTexts);
            const results = await this.index!.queryItems(queryEmbeddings[0], nResults, where);

            return results.map(result => ({
                id: result.item.id,
                metadata: { ...result.item.metadata, text: undefined },
                text: result.item.metadata.text,
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
        artifactId?: string
    ): Promise<void> {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 2000,
            chunkOverlap: 100,
        });

        const docId = crypto.randomUUID();
        await saveToFile(projectId, type, docId, content);

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

            const metadata: ConversationContext = {
                url,
                projectId,
                title,
                docId,
                chunkId: index + 1,
                chunkTotal: chunks.length,
                artifactId
            };

            if (type === 'summary') {
                metadata.task = task;
                metadata.type = type;
            }

            addCollection.metadatas.push(metadata);
            addCollection.documents.push(chunkContent);
        });

        await this.addDocuments(addCollection);
    }

    async clearCollection(): Promise<void> {
        await syncQueue.enqueue(async () => {
            this.index = new LocalIndex();
            Logger.info("Cleared Vectra index");
        });
    }

    async reindexCollection(name: string): Promise<void> {
        await syncQueue.enqueue(async () => {
            await this.clearCollection();
            await this.initializeCollection(name);
        });
    }

    async getTokenCount(content: string): Promise<number> {
        return this.lmStudioService.getTokenCount(content);
    }
}

export default VectraService;
