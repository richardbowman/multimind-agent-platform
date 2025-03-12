import { IVectorDatabase } from "src/llm/IVectorDatabase";
import { ModelHelpers } from "src/llm/modelHelpers";
import { globalRegistry } from "src/llm/promptBuilder";
import { Artifact } from "src/tools/artifact";
import { ArtifactManager } from "src/tools/artifactManager";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { ExecutorType } from "../interfaces/ExecutorType";
import { StepExecutor } from "../interfaces/StepExecutor";
import { StepResponseType, StepResponse, StepResult, ReplanType } from "../interfaces/StepResult";
import { FullArtifactStepResponse } from "./RetrieveFullArtifactExecutor";

@StepExecutorDecorator(ExecutorType.SEARCH_ARTIFACT, 'Retrieve relevant artifact chunks using vector search')
export class VectorArtifactRetrieverExecutor implements StepExecutor<FullArtifactStepResponse> {
    private artifactManager: ArtifactManager;
    private vectorDB: IVectorDatabase;
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.artifactManager = params.artifactManager;
        this.vectorDB = params.vectorDB;
        this.modelHelpers = params.modelHelpers;

        globalRegistry.stepResponseRenderers.set(StepResponseType.FullArtifact, async (response : StepResponse) => {
            const artifactIds = response.data?.selectedArtifactIds;
            const artifacts : Artifact[] = artifactIds && await this.artifactManager.bulkLoadArtifacts(artifactIds);
            return (artifacts?.length||0>0 ? artifacts?.map((a, index) => `LOADED FULL ARTIFACT ${index} of ${artifacts.length}\n<content>\n${a.content.toString()}</content>\n`)?.join("\n") : undefined) ?? "[NO LOADED ARTIFACTS]";
        });
    }

    async execute(params: ExecuteParams): Promise<StepResult<FullArtifactStepResponse>> {
        // Get all available artifacts
        const allArtifacts = params.context?.artifacts||[];

        if (!allArtifacts.length) {
            return {
                finished: true,
                response: {
                    type: StepResponseType.FullArtifact,
                    message: 'No artifacts available to retrieve',
                    data: {
                        selectedArtifactIds: [],
                        selectionReason: 'No artifacts available'
                    }
                }
            };
        }

        // Perform vector search
        const query = params.message || params.stepGoal;
        const searchResults = await this.vectorDB.query([query], {}, 5);

        // Get unique artifact IDs from search results
        const artifactIds = [...new Set(searchResults.map(result => result.metadata.artifact_id))];
        const selectedArtifacts = allArtifacts.filter(artifact => artifactIds.includes(artifact.id));

        return {
            finished: true,
            replan: ReplanType.Allow,
            response: {
                type: StepResponseType.FullArtifact,
                message: `Found ${selectedArtifacts.length} relevant artifacts using vector search`,
                data: {
                    selectedArtifactIds: selectedArtifacts.map(a => a.id),
                    selectionReason: 'Selected based on semantic similarity to query'
                }
            }
        };
    }
}
