import { ChromaClient } from "chromadb";
import { EventEmitter } from "events";
import crypto from 'crypto';
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import dotenv from 'dotenv';
import { CHROMADB_URL } from "../helpers/config";
import Logger from "src/helpers/logger";
import { ConversationContext } from "../chat/chatClient";
import { saveToFile } from "src/tools/storeToFile";
import { IVectorDatabase, SearchResult } from "./IVectorDatabase";
import { ILLMService } from "./ILLMService";

dotenv.config();

class ChromaDBService extends EventEmitter implements IVectorDatabase {
    private chromaDB: ChromaClient;
    private collection: Collection | null = null;
    private lmStudioService: ILLMService;

    constructor(lmStudioService: ILLMService) {
        super();
        this.chromaDB = new ChromaClient({ path: CHROMADB_URL! });
        this.lmStudioService = lmStudioService;
    }

    async initializeCollection(name: string): Promise<void> {
        const collections = await this.chromaDB.listCollections();
        const existingCollection = collections.find(c => c.name === name);

        if (existingCollection) {
            this.collection = await this.chromaDB.getCollection({
                name,
                embeddingFunction: this.lmStudioService.getEmbeddingModel()
            });
            
            // Check if collection has any data
            const count = (await this.collection.count());
            if (count === 0) {
                Logger.warn(`ChromaDB Collection ${name} is empty - needs reindexing`);
                this.emit('needsReindex');
            } else {
                Logger.info(`ChromaDB Collection found and loaded: ${name} with ${count} items`);
            }
        } else {
            this.collection = await this.chromaDB.createCollection({
                name,
                embeddingFunction: this.lmStudioService.getEmbeddingModel()
            });
            Logger.warn(`ChromaDB Collection created: ${name} - needs initial indexing`);
            this.emit('needsReindex');
        }
    }

    async addDocuments(addCollection: { ids: string[], metadatas: any[], documents: string[] }): Promise<void> {
        if (!this.collection) throw new Error("Collection not initialized");
        await this.collection.add(addCollection);
    }

    /**
     * @deprecated
     */
    async queryOld(queryTexts: string[], where: any, nResults: number): Promise<any> {
        if (!this.collection) throw new Error("Collection not initialized");
        return await this.collection.query({ queryTexts, where, nResults });
    }

    async query(queryTexts: string[], where: any, nResults: number): Promise<SearchResult[]> {
        if (!this.collection) throw new Error("Collection not initialized");

        const rawResults = await this.collection.query({ queryTexts, where, nResults });

        return rawResults.ids[0].map((result, index) => ({
            id: result,
            metadata: rawResults.metadatas[0][index],
            text: rawResults.documents[0][index],
            score: rawResults.distances[0] ? rawResults.distances[0][index] : undefined
        }));
    }

    computeHash(content: string): string {
        const hash = crypto.createHash('sha256');
        hash.update(content);
        return hash.digest('hex');
    }

    async handleContentChunks(content: string, url: string, task: string, projectId: string, title: string, type = 'content', artifactId?: string) {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 2000,
            chunkOverlap: 100,
        });


        // Save the page to a file
        const docId = crypto.randomUUID();
        await saveToFile(projectId, type, docId, content);

        // Logger.info(`Saving content to db: ${url}`);
        const chunks = await splitter.createDocuments([content]);

        const addCollection: { ids: string[], metadatas: any[], documents: string[] } = {
            ids: [],
            metadatas: [],
            documents: []
        };

        chunks.forEach(async (c, index) => {
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

    async listCollectionsAndItems(): Promise<void> {
        const collections = await this.chromaDB.listCollections();

        for (const param of collections) {
            console.log(`Collection: ${param.name}`);

            const collection = await this.chromaDB.getCollection(param);
            const items = await collection.get({});
            console.log(`Items in collection "${collection.name}":`);
            items.documents.forEach((doc, index) => {
                console.log(`Item ${index + 1}:`);
                console.log(`  ID: ${items.ids[index]}`);
                console.log(`  Metadata: ${JSON.stringify(items.metadatas[index])}`);
                console.log(`  Document: ${doc}`);
            });
        }
    }

    async clearCollection(): Promise<void> {
        if (!this.collection) throw new Error("Collection not initialized");
        Logger.info("Clearing ChromaDB collection");
        await this.collection.delete();
    }

    async reindexCollection(name: string): Promise<void> {
        await this.clearCollection();
        await this.initializeCollection(name);
    }

    async getTokenCount(content: string) {
        return this.lmStudioService.getTokenCount(content);
    }

    public async listCollections() {
        return await this.chromaDB.listCollections();
    }

    public async hasCollection(name: string): Promise<boolean> {
        const collections = await this.listCollections();
        return collections.some(c => c.name === name);
    }

    public async getItems() {
        if (!this.collection) throw new Error("Collection not initialized");
        return await this.collection.get({});
    }

    public async deleteCollection(name: string): Promise<void> {
        await this.chromaDB.deleteCollection({name});
    }
}

export default ChromaDBService;
