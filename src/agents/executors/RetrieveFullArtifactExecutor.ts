import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { ReplanType, StepResponse, StepResponseType, StepResult } from "../interfaces/StepResult";
import { ArtifactManager } from "src/tools/artifactManager";
import { ModelHelpers } from "src/llm/modelHelpers";
import { ContentType, globalRegistry } from "src/llm/promptBuilder";
import { ModelType } from "src/llm/LLMServiceFactory";
import { ExecutorType } from "../interfaces/ExecutorType";
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { StringUtils } from 'src/utils/StringUtils';
import { ArtifactSelectionResponse } from "src/schemas/ArtifactSelectionResponse";
import { UUID } from "src/types/uuid";
import { Artifact } from "src/tools/artifact";
import { IVectorDatabase } from "src/llm/IVectorDatabase";

export interface FullArtifactStepResponse extends StepResponse {
    type: StepResponseType.FullArtifact;
    data?: {
        selectedArtifactIds: UUID[]; // Array of full artifact content
        selectionReason: string;
    };
}

@StepExecutorDecorator(ExecutorType.ARTIFACT_RETRIEVER, 'Retrieve full content of attached artifacts')
export class RetrieveFullArtifactExecutor implements StepExecutor<FullArtifactStepResponse> {
    private artifactManager: ArtifactManager;
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.artifactManager = params.artifactManager;
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

        // Generate structured prompt
        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`Your task is to select the most relevant artifacts from the available collection based on the user's request.`);
        prompt.addContext({contentType: ContentType.PURPOSE});
        prompt.addContext({contentType: ContentType.GOALS_FULL, params});
        prompt.addContext({contentType: ContentType.EXECUTE_PARAMS, params});
        prompt.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: allArtifacts});

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
                .map(index => allArtifacts[index - 1].id)||[];

            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.FullArtifact,
                    status: `Retrieved ${selectedArtifactIds.length} artifacts:\n${json?.selectionReason}`,
                    data: {
                        selectedArtifactIds,
                        selectionReason: json?.selectionReason||"[Unknown reason]"
                    }
                }
            };
        } catch (error) {
            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.FullArtifact,
                    status: 'Failed to retrieve artifacts. Please try again later.'
                }
            };
        }
    }
}
