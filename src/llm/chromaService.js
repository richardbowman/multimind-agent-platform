"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const chromadb_1 = require("chromadb");
const events_1 = require("events");
const crypto_1 = __importDefault(require("crypto"));
const text_splitter_1 = require("langchain/text_splitter");
const dotenv_1 = __importDefault(require("dotenv"));
const config_1 = require("../helpers/config");
const logger_1 = __importDefault(require("src/helpers/logger"));
const storeToFile_1 = require("src/tools/storeToFile");
dotenv_1.default.config();
class ChromaDBService extends events_1.EventEmitter {
    constructor(lmStudioService) {
        super();
        this.collection = null;
        this.chromaDB = new chromadb_1.ChromaClient({ path: config_1.CHROMADB_URL });
        this.lmStudioService = lmStudioService;
    }
    async initializeCollection(name) {
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
                logger_1.default.warn(`ChromaDB Collection ${name} is empty - needs reindexing`);
                this.emit('needsReindex');
            }
            else {
                logger_1.default.info(`ChromaDB Collection found and loaded: ${name} with ${count} items`);
            }
        }
        else {
            this.collection = await this.chromaDB.createCollection({
                name,
                embeddingFunction: this.lmStudioService.getEmbeddingModel()
            });
            logger_1.default.warn(`ChromaDB Collection created: ${name} - needs initial indexing`);
            this.emit('needsReindex');
        }
    }
    async addDocuments(addCollection) {
        if (!this.collection) {
            throw new Error("Collection not initialized - call initializeCollection() first");
        }
        await this.collection.add(addCollection);
    }
    /**
     * @deprecated
     */
    async queryOld(queryTexts, where, nResults) {
        if (!this.collection)
            throw new Error("Collection not initialized");
        return await this.collection.query({ queryTexts, where, nResults });
    }
    async query(queryTexts, where, nResults) {
        if (!this.collection)
            throw new Error("Collection not initialized");
        const rawResults = await this.collection.query({ queryTexts, where, nResults });
        return rawResults.ids[0].map((result, index) => ({
            id: result,
            metadata: rawResults.metadatas[0][index],
            text: rawResults.documents[0][index],
            score: rawResults.distances[0] ? rawResults.distances[0][index] : undefined
        }));
    }
    computeHash(content) {
        const hash = crypto_1.default.createHash('sha256');
        hash.update(content);
        return hash.digest('hex');
    }
    async handleContentChunks(content, url, task, projectId, title, type = 'content', artifactId) {
        const splitter = new text_splitter_1.RecursiveCharacterTextSplitter({
            chunkSize: 2000,
            chunkOverlap: 100,
        });
        // Save the page to a file
        const docId = crypto_1.default.randomUUID();
        await (0, storeToFile_1.saveToFile)(projectId, type, docId, content);
        // Logger.info(`Saving content to db: ${url}`);
        const chunks = await splitter.createDocuments([content]);
        const addCollection = {
            ids: [],
            metadatas: [],
            documents: []
        };
        chunks.forEach(async (c, index) => {
            const chunkContent = c.pageContent;
            const hashId = this.computeHash(chunkContent);
            if (addCollection.ids.includes(hashId))
                return;
            addCollection.ids.push(hashId);
            const metadata = {
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
    async listCollectionsAndItems() {
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
    async clearCollection() {
        if (!this.collection)
            throw new Error("Collection not initialized");
        logger_1.default.info("Clearing ChromaDB collection");
        await this.collection.delete();
    }
    async reindexCollection(name) {
        await this.clearCollection();
        await this.initializeCollection(name);
    }
    async getTokenCount(content) {
        return this.lmStudioService.getTokenCount(content);
    }
    async listCollections() {
        return await this.chromaDB.listCollections();
    }
    async hasCollection(name) {
        const collections = await this.listCollections();
        return collections.some(c => c.name === name);
    }
    async getItems() {
        if (!this.collection)
            throw new Error("Collection not initialized");
        return await this.collection.get({});
    }
    async deleteCollection(name) {
        await this.chromaDB.deleteCollection({ name });
    }
}
exports.default = ChromaDBService;
