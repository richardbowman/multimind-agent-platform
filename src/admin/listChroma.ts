import ChromaDBService from "src/llm/chromaService";

const chromaDBService = new ChromaDBService();
await chromaDBService.listCollectionsAndItems();