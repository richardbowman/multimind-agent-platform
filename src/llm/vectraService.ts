import { EventEmitter } from "events";
import { LocalIndex } from "vectra";
import crypto from 'crypto';
import path from 'path';
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import LMStudioService from "./lmstudioService";
import { IVectorDatabase, SearchResult } from "./IVectorDatabase";
import Logger from "../helpers/logger";
import { saveToFile } from "../tools/storeToFile";
import { ConversationContext } from "../chat/chatClient";

class VectraService extends EventEmitter implements IVectorDatabase {
    private index: LocalIndex | null = null;
    private lmStudioService: LMStudioService;
    private collectionName: string = '';

    constructor(lmStudioService: LMStudioService) {
        super();
        this.lmStudioService = lmStudioService;
    }

    async initializeCollection(name: string): Promise<void> {
        this.collectionName = name;
        const indexPath = path.join(process.cwd(), 'data', 'vectra', name);
        this.index = new LocalIndex(indexPath);
        
        if (!(await this.index.isIndexCreated())) {
            await this.index.createIndex();
        }
        
        Logger.info(`Vectra index initialized for collection: ${name} at ${indexPath}`);
    }

    async addDocuments(collection: { ids: string[], metadatas: any[], documents: string[] }): Promise<void> {
        if (!this.index) throw new Error("Index not initialized");

        const embedder = this.lmStudioService.getEmbeddingModel();
        const embeddings = await embedder.generate(collection.documents);
        
        for (let i = 0; i < collection.documents.length; i++) {
            this.index.insertItem({
                id: collection.ids[i],
                vector: embeddings[i],
                metadata: {
                    ...collection.metadatas[i],
                    text: collection.documents[i]
                }
            });
        }
    }

    async query(queryTexts: string[], where: any, nResults: number): Promise<SearchResult[]> {
        if (!this.index) throw new Error("Index not initialized");

        const queryEmbeddings = await this.lmStudioService.getEmbeddings(queryTexts);
        const results = this.index.query({
            vector: queryEmbeddings[0],
            k: nResults,
            filter: (item) => {
                for (const [key, value] of Object.entries(where)) {
                    if (item.metadata[key] !== value) return false;
                }
                return true;
            }
        });

        return results.map(result => ({
            id: result.id,
            metadata: { ...result.metadata, text: undefined },
            text: result.metadata.text,
            score: result.score
        }));
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
        this.index = new LocalIndex();
        Logger.info("Cleared Vectra index");
    }

    async reindexCollection(name: string): Promise<void> {
        await this.clearCollection();
        await this.initializeCollection(name);
    }

    async getTokenCount(content: string): Promise<number> {
        return this.lmStudioService.getTokenCount(content);
    }
}

export default VectraService;
