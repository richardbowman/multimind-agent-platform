import { StepExecutor } from './stepBasedAgent';
import { ExecutorConstructorParams } from './interfaces/ExecutorConstructorParams';
import { StepResult } from './interfaces/StepResult';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ModelHelpers } from 'src/llm/modelHelpers';

@StepExecutorDecorator(ExecutorType.DOCUMENT_RETRIEVAL, 'Retrieve requested documents from artifact store')
export class DocumentRetrievalExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = new ModelHelpers(params.llmService, 'executor');
        this.artifactManager = params.artifactManager!;
        this.modelHelpers.setPurpose(`You are a document retrieval specialist. Your job is to find and return requested documents from the artifact store.`);
        this.modelHelpers.setFinalInstructions(`Return the exact document content that was requested. If multiple documents are requested, return them in order.`);
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const artifactIds = params.message?.match(/artifact-ids: \[(.*)\]/)?.[1]?.split(',') || [];
        const artifacts = await Promise.all(artifactIds.map(id => this.artifactManager.getArtifact(id)));

        return {
            success: true,
            result: artifacts.map(a => a.content).join('\n\n'),
            metadata: {
                retrievedArtifactIds: artifactIds
            }
        };
    }
}
