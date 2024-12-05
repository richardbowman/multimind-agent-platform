import { ChromaClient, CollectionType } from "chromadb";
import LMStudioService from "./lmstudioService";
import crypto from 'crypto';
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import dotenv from 'dotenv';
import { CHROMADB_URL } from "../helpers/config";
import Logger from "src/helpers/logger";
import { ConversationContext } from "../chat/chatClient";
import { saveToFile } from "src/tools/storeToFile";

dotenv.config();

class ChromaDBService {
    private chromaDB: ChromaClient;
    private collection: CollectionType | null = null;
    private lmStudioService: LMStudioService;

    constructor(lmStudioService: LMStudioService) {
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
            Logger.info(`ChromaDB Collection found and loaded: ${name}`);   
        } else {
            this.collection = await this.chromaDB.createCollection({
                name,
                embeddingFunction: this.lmStudioService.getEmbeddingModel()
            });
            Logger.info(`ChromaDB Collection created: ${name}`)
        }
    }

    async addDocuments(addCollection: { ids: string[], metadatas: any[], documents: string[] }): Promise<void> {
        if (!this.collection) throw new Error("Collection not initialized");
        await this.collection.add(addCollection);
    }

    async query(queryTexts: string[], where: any, nResults: number): Promise<any> {
        if (!this.collection) throw new Error("Collection not initialized");
        return await this.collection.query({ queryTexts, where, nResults });
    }

    async handleContentChunks(content: string, url: string, task: string, projectId: string, title: string, type = 'content') {
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

            const metadata : ConversationContext = {
                url,
                projectId,
                title,
                docId,
                chunkId: index + 1,
                chunkTotal: chunks.length
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

    computeHash(content: string): string {
        const hash = crypto.createHash('sha256');
        hash.update(content);
        return hash.digest('hex');
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
}

export default ChromaDBService;