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

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        // Extract the document request from the message
        const documentRequest = params.stepGoal || params.message;
        
        // Search for relevant artifacts using the vector database
        const searchResults = await this.vectorDB.query(
            [documentRequest], 
            {}, 
            5 // Return top 5 matches for filtering
        );

        // Get artifact metadata for filtering
        const artifactMetadatas = await Promise.all(
            searchResults
                .filter(result => result.metadata.artifactId)
                .map(async result => {
                    const artifact = await this.artifactManager.loadArtifact(result.metadata.artifactId);
                    return {
                        id: artifact.id,
                        title: artifact.metadata?.title || 'Untitled',
                        contentPreview: artifact.content.slice(0, 200) + '...',
                        score: result.score
                    };
                })
        );

        // Have LLM select the most relevant artifacts
        const selectionPrompt = `You are helping select the most relevant documents for this request:
"${documentRequest}"

Here are the candidate documents:
${artifactMetadatas.map((a, i) => 
    `${i + 1}. ${a.title}\n` +
    `   Preview: ${a.contentPreview}\n` +
    `   Relevance Score: ${a.score.toFixed(2)}`
).join('\n\n')}

Select the most relevant documents (1-3) and explain your choices.`;

        const selectionResponse = await this.modelHelpers.generate({
            message: selectionPrompt,
            instructions: `You are a document selection expert. Analyze the request and available documents, then select the most relevant ones.`
        });

        // Parse selected artifact IDs from LLM response
        const selectedIds = artifactMetadatas
            .filter((_, i) => selectionResponse.message.includes(`${i + 1}.`))
            .map(a => a.id);

        // Retrieve full content of selected artifacts
        const selectedArtifacts = await Promise.all(
            selectedIds.map(id => this.artifactManager.loadArtifact(id))
        );

        return {
            finished: true,
            response: {
                message: `Selected documents:\n\n${selectionResponse.message}\n\n` +
                    `Document Contents:\n${selectedArtifacts.map(a => `# ${a.metadata?.title || 'Untitled'}\n\n${a.content}`).join('\n\n')}`,
                artifactIds: selectedIds,
                data: {
                    searchQuery: documentRequest,
                    selectionReasoning: selectionResponse.message
                }
            },
        };
    }
}
