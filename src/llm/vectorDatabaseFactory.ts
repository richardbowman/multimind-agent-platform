import { IVectorDatabase } from './IVectorDatabase';
import ChromaDBService from './chromaService';
import VectraService from './vectraService';
import { ILLMService } from './ILLMService';

export enum VectorDatabaseType {
    CHROMA = 'chroma',
    VECTRA = 'vectra'
}

export function createVectorDatabase(
    type: string = VectorDatabaseType.VECTRA,
    lmStudioService: ILLMService
): IVectorDatabase {
    switch (type) {
        case VectorDatabaseType.CHROMA:
            return new ChromaDBService(lmStudioService);
        case VectorDatabaseType.VECTRA:
            return new VectraService(lmStudioService);
        default:
            return new VectraService(lmStudioService);
    }
}
