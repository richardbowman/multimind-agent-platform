import ChromaDBService from "../chromaService";
import { ORCHESTRATOR_TOKEN_ID, ORCHESTRATOR_USER_ID, PROJECTS_CHANNEL_ID, RESEARCHER_TOKEN, RESEARCHER_USER_ID } from "../config";
import MattermostClient from "../chat/mattermostClient";

const CHROMA_COLLECTION = "webpage_scrapes";
const chromaDBService = new ChromaDBService();

//await chromaDBService.initializeCollection(CHROMA_COLLECTION);

// await chromaDBService.chromaDB.deleteCollection({name: CHROMA_COLLECTION});

        
// // Query ChromaDB for related documents
// const queryTexts = ["summarize key learnings"];
// const where: any = {
//     "$and": [
//         {"type": {"$eq": "summary"}}, 
//         {"projectId": {"$eq": "0.6373089437754307"}}
//     ]
// };
// const nResults = 10;

// try {
//     const response = await chromaDBService.query(queryTexts, where, 3);
//     Logger.info("Query Results:", response);

//     // Combine the original aggregated data with query results
//     Logger.info(response.documents);
// } catch (error) {
//     Logger.error('Error querying ChromaDB:', error);
//     throw error;
// }

// const client = new MattermostClient(ORCHESTRATOR_TOKEN_ID, ORCHESTRATOR_USER_ID);
// const c = await client.findProjectChain(PROJECTS_CHANNEL_ID, "231231cd-4ede-4e26-a565-b78c2af2e5f8")
// Logger.info(c);
