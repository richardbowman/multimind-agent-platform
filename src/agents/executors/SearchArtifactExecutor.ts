import { IVectorDatabase, SearchResult } from "src/llm/IVectorDatabase";
import { ModelHelpers } from "src/llm/modelHelpers";
import { ContentType, globalRegistry } from "src/llm/promptBuilder";
import { Artifact } from "src/tools/artifact";
import { ArtifactManager } from "src/tools/artifactManager";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { ExecutorType } from "../interfaces/ExecutorType";
import { StepExecutor } from "../interfaces/StepExecutor";
import { StepResponseType, StepResponse, StepResult, ReplanType } from "../interfaces/StepResult";
import { FullArtifactStepResponse } from "./RetrieveFullArtifactExecutor";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { SchemaType } from "src/schemas/SchemaTypes";
import { StringUtils } from "src/utils/StringUtils";
import { ArtifactSelectionResponse } from "src/schemas/ArtifactSelectionResponse";
import { ModelType } from "src/llm/types/ModelType";
import { asError } from "src/types/types";


export interface ChunksStepResponse extends StepResponse {
    type: StepResponseType.Excerpts;
    data?: {
        chunks: SearchResult[]
    };
}

@StepExecutorDecorator(ExecutorType.SEARCH_ARTIFACT, 'Search within an artifact to find relevant excerpts')
export class SearchArtifactExecutor implements StepExecutor<ChunksStepResponse> {
    private artifactManager: ArtifactManager;
    private vectorDB: IVectorDatabase;
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.artifactManager = params.artifactManager;
        this.vectorDB = params.vectorDB;
        this.modelHelpers = params.modelHelpers;

        globalRegistry.stepResponseRenderers.set(StepResponseType.FullArtifact, async (response: StepResponse) => {
            const artifactIds = response.data?.selectedArtifactIds;
            const artifacts: Artifact[] = artifactIds && await this.artifactManager.bulkLoadArtifacts(artifactIds);
            return (artifacts?.length || 0 > 0 ? artifacts?.map((a, index) => `LOADED FULL ARTIFACT ${index} of ${artifacts.length}\n<content>\n${a.content.toString()}</content>\n`)?.join("\n") : undefined) ?? "[NO LOADED ARTIFACTS]";
        });
    }

    async execute(params: ExecuteParams): Promise<StepResult<ChunksStepResponse>> {
        // Get all available artifacts
        const allArtifacts = params.context?.artifacts || [];

        if (!allArtifacts.length) {
            return {
                finished: true,
                response: {
                    type: StepResponseType.Excerpts,
                    message: 'No artifacts provided in context to search',
                    data: {
                        chunks: []
                    }
                }
            };
        }

        // Generate structured prompt
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`Your task is to select the most relevant artifacts from the available collection based on the user's request.`);
        prompt.addContext({ contentType: ContentType.PURPOSE });
        prompt.addContext({ contentType: ContentType.GOALS_FULL, params });
        prompt.addContext({ contentType: ContentType.EXECUTE_PARAMS, params });
        prompt.addContext({ contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: allArtifacts });

        const schema = await getGeneratedSchema(SchemaType.ArtifactSelectionResponse);

        prompt.addInstruction(`OUTPUT INSTRUCTIONS:
1. Include a JSON object in your response, enclosed in a \`\`\`json code block matching this schema:
${JSON.stringify(schema, null, 2)}
2. The artifactIndexes field should contain the list numbers (1-N) from the ARTIFACTS EXCERPTS above
3. Include a clear selectionReason explaining why these artifacts were chosen`);

        try {
            const unstructuredResult = await this.modelHelpers.generate({
                message: params.message || params.stepGoal,
                instructions: prompt,
                threadPosts: params.context?.threadPosts,
                modelType: ModelType.REASONING
            });

            const json = StringUtils.extractAndParseJsonBlock<ArtifactSelectionResponse>(unstructuredResult.message, schema);

            // Convert indexes to artifact content (indexes are 1-based)
            const selectedArtifactIds = json?.artifactIndexes
                .filter(index => index > 0 && index <= allArtifacts.length)
                .map(index => allArtifacts[index - 1].id) || [];

            // Perform vector search
            const query = params.message || params.stepGoal;
            const searchResults = await this.vectorDB.query([query], { artifactId: { $in: selectedArtifactIds } }, 5);

            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.Excerpts,
                    status: `Found ${searchResults.length} relevant excerpts using vector search`,
                    data: {
                        chunks: searchResults
                    }
                }
            };
        } catch (error) {
            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.Excerpts,
                    status: `Failed to retrieve search results. Error: ${asError(error).message}`
                }
            };
        }
    }
}
