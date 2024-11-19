import { ChromaClient, Collection, TransformersEmbeddingFunction } from "chromadb";
import LMStudioService from "./lmstudioService";
import crypto from 'crypto';
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import dotenv from 'dotenv';
import { CHROMADB_URL } from "./config";

dotenv.config();

class ChromaDBService {
    private chromaDB: ChromaClient;
    private collection: Collection | null = null;
    private lmStudioService: LMStudioService;

    constructor() {
        this.chromaDB = new ChromaClient({ path: CHROMADB_URL! });
        this.lmStudioService = new LMStudioService();
    }

    async initializeCollection(name: string): Promise<void> {
        const collections = await this.chromaDB.listCollections();
        const existingCollection = collections.find(c => c.name === name);

        await this.lmStudioService.initializeEmbeddingModel(process.env.EMBEDDING_MODEL!);

        if (existingCollection) {
            this.collection = await this.chromaDB.getCollection({
                name,
                embeddingFunction: this.lmStudioService.getEmbeddingModel()
            });
        } else {
            this.collection = await this.chromaDB.createCollection({
                name,
                embeddingFunction: this.lmStudioService.getEmbeddingModel()
            });
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

    async handleContentChunks(content: string, url: string, task: string, projectId: string, primaryGoal: string, type = 'content') {
        const splitter = new RecursiveCharacterTextSplitter({
            chunkSize: 2000,
            chunkOverlap: 100,
        });

        console.log("Saving content to db: ${url}");
        const chunks = await splitter.createDocuments([content]);

        // console.log(chunks);

        const addCollection: { ids: string[], metadatas: any[], documents: string[] } = {
            ids: [],
            metadatas: [],
            documents: []
        };

        chunks.forEach(c => {
            const chunkContent = c.pageContent;
            const hashId = this.computeHash(chunkContent);
            addCollection.ids.push(hashId);

            const metadata = {
                url,
                projectId,
                primaryGoal
            };

            if (type === 'summary') {
                metadata.task = task;
                metadata.type = type;
            }

            //console.log(metadata);
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
}

export default ChromaDBService;