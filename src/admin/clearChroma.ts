import { CHROMA_COLLECTION } from "../helpers/config";
import ChromaDBService from '../llm/chromaService';
import Logger from "src/helpers/logger";

async function deleteCollection(collectionName: string) {
    try {
        const chromaDBService = new ChromaDBService();
        
        // Initialize the collection to ensure it exists and load the embedding model
        await chromaDBService.initializeCollection(collectionName);

        if (chromaDBService) {
            await chromaDBService.chromaDB.deleteCollection({name: collectionName});
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