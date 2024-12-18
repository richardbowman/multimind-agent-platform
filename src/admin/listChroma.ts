import ChromaDBService from "src/llm/chromaService";

import LMStudioService from "../llm/lmstudioService";

const lmStudioService = new LMStudioService();
await lmStudioService.initializeEmbeddingModel(process.env.EMBEDDING_MODEL || "");
const chromaDBService = new ChromaDBService(lmStudioService);
await chromaDBService.listCollectionsAndItems();
