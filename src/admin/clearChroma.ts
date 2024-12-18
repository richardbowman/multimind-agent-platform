import LMStudioService from "src/llm/lmstudioService";
import { CHROMA_COLLECTION, EMBEDDING_MODEL } from "../helpers/config";
import ChromaDBService from '../llm/chromaService';
import Logger from "src/helpers/logger";

async function deleteCollection(collectionName: string) {
    try {
        const lmStudioService = new LMStudioService();
        await lmStudioService.initializeEmbeddingModel(EMBEDDING_MODEL);
        const chromaDBService = new ChromaDBService(lmStudioService);
        
        // Initialize the collection to ensure it exists and load the embedding model
        await chromaDBService.initializeCollection(collectionName);

        if (chromaDBService) {
            await chromaDBService.deleteCollection(collectionName);
            Logger.info(`Collection "${collectionName}" has been successfully deleted.`);
        } else {
            Logger.info(`Collection "${collectionName}" does not exist.`);
        }
    } catch (error) {
        Logger.error('Error deleting collection:', error);
    }
}

// Replace 'your-collection-name' with the actual name of the collection you want to delete
await deleteCollection(CHROMA_COLLECTION);
