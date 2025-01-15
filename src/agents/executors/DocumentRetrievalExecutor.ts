import { ModelHelpers } from "src/llm/modelHelpers";
import { ArtifactManager } from "src/tools/artifactManager";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';
import { ExecutorType } from "../interfaces/ExecutorType";
import { IVectorDatabase } from "src/llm/IVectorDatabase";
import { message } from "blessed";

@StepExecutorDecorator(ExecutorType.DOCUMENT_RETRIEVAL, 'Retrieve requested documents from artifact store')
export class DocumentRetrievalExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;
    private vectorDB: IVectorDatabase;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.artifactManager = params.artifactManager!;
        this.vectorDB = params.vectorDB;
        this.modelHelpers.setPurpose(`You are a document retrieval specialist. Your job is to find and return requested documents from the artifact store.`);
        this.modelHelpers.setFinalInstructions(`Return the exact document content that was requested. If multiple documents are requested, return them in order.`);
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        // Extract the document request from the message
        const documentRequest = params.stepGoal || params.message;
        
        // Search for relevant artifacts using the vector database
        const searchResults = await this.vectorDB.query(
            [documentRequest], 
            {}, 
            3 // Return top 3 matches
        );

        // Retrieve the full content of the matching artifacts
        const artifacts = await Promise.all(
            searchResults.filter(result => result.metadata.artifactId).map(result => this.artifactManager.loadArtifact(result.metadata.artifactId))
        );

        return {
            finished: true,
            response: {
                message: artifacts.map(a => a.content).join('\n\n'),
                data: {
                    retrievedArtifactIds: artifacts.map(a => a.id),
                    searchQuery: documentRequest
                }
            },
        };
    }
}
