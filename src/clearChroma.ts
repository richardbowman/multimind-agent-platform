import { CHROMA_COLLECTION } from "./config";
import ChromaDBService from './chromaService';

async function deleteCollection(collectionName: string) {
    try {
        const chromaDBService = new ChromaDBService();
        
        // Initialize the collection to ensure it exists and load the embedding model
        await chromaDBService.initializeCollection(collectionName);

        if (chromaDBService) {
            await chromaDBService.chromaDB.deleteCollection({name: collectionName});
            console.log(`Collection "${collectionName}" has been successfully deleted.`);
        } else {
            console.log(`Collection "${collectionName}" does not exist.`);
        }
    } catch (error) {
        console.error('Error deleting collection:', error);
    }
}

// Replace 'your-collection-name' with the actual name of the collection you want to delete
await deleteCollection(CHROMA_COLLECTION);