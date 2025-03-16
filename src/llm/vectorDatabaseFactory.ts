import { IVectorDatabase } from './IVectorDatabase';
import ChromaDBService from './chromaService';
import VectraService from './vectraService';
import SQLiteVecService from './sqliteVecService';
import { IEmbeddingService, ILLMService } from './ILLMService';

export enum VectorDatabaseType {
    CHROMA = 'chroma',
    VECTRA = 'vectra',
    SQLITE_VEC = 'sqlite_vec'
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
        case VectorDatabaseType.SQLITE_VEC:
            return new SQLiteVecService(embeddingService, llmService);
        default:
            return new SQLiteVecService(embeddingService, llmService);
    }
}
