import { IVectorDatabase } from './IVectorDatabase';
import ChromaDBService from './chromaService';
import VectraService from './vectraService';
import { IEmbeddingService, ILLMService } from './ILLMService';

export enum VectorDatabaseType {
    CHROMA = 'chroma',
    VECTRA = 'vectra'
}

export function createVectorDatabase(
    type: string = VectorDatabaseType.VECTRA,
    embeddingService: IEmbeddingService,
    llmService: ILLMService
): IVectorDatabase {
    switch (type) {
        case VectorDatabaseType.CHROMA:
            return new ChromaDBService(embeddingService, llmService);
        case VectorDatabaseType.VECTRA:
            return new VectraService(embeddingService, llmService);
        default:
            return new VectraService(embeddingService, llmService);
    }
}
