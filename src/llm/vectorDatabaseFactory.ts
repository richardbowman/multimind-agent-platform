import { IVectorDatabase } from './IVectorDatabase';
import ChromaDBService from './chromaService';
import VectraService from './vectraService';
import LMStudioService from './lmstudioService';

export enum VectorDatabaseType {
    CHROMA = 'chroma',
    VECTRA = 'vectra'
}

export function createVectorDatabase(
    type: string = VectorDatabaseType.CHROMA,
    lmStudioService: LMStudioService
): IVectorDatabase {
    switch (type) {
        case VectorDatabaseType.CHROMA:
            return new ChromaDBService(lmStudioService);
        case VectorDatabaseType.VECTRA:
            return new VectraService(lmStudioService);
        default:
            return new ChromaDBService(lmStudioService);
    }
}
