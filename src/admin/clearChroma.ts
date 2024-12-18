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

        await chromaDBService.deleteCollection(collectionName);
        Logger.info(`Collection "${collectionName}" has been successfully deleted.`);
    } catch (error) {
        Logger.error('Error deleting collection:', error);
    }
}

async function main() {
    await deleteCollection(CHROMA_COLLECTION);
}

main().catch(error => {
    Logger.error('Fatal error:', error);
    process.exit(1);
});
