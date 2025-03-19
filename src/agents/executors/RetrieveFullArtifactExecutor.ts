import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { ReplanType, StepResponse, StepResponseType, StepResult } from "../interfaces/StepResult";
import { ArtifactManager } from "src/tools/artifactManager";
import { ModelHelpers } from "src/llm/modelHelpers";
import { ContentType, globalRegistry, OutputType } from "src/llm/promptBuilder";
import { ModelType } from "src/llm/LLMServiceFactory";
import { ExecutorType } from "../interfaces/ExecutorType";
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { StringUtils } from 'src/utils/StringUtils';
import { ArtifactSelectionResponse } from "src/schemas/ArtifactSelectionResponse";
import { isUUID, UUID } from "src/types/uuid";
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

        globalRegistry.stepResponseRenderers.set(StepResponseType.FullArtifact, async (untypedResponse : StepResponse, allSteps: StepResponse[]) => {
            const response = untypedResponse as FullArtifactStepResponse;
            const pastSteps = allSteps.filter(r => r?.type === StepResponseType.FullArtifact) as FullArtifactStepResponse[];
            const lastGenArtifactStep = pastSteps[pastSteps.length-1];
            const isLast = response === lastGenArtifactStep;
            if (isLast) {
                const allArtifactIds = pastSteps.map(r => r.data?.selectedArtifactIds).flat().filter(a => a !== undefined);

                const artifactIds = response.data?.selectedArtifactIds;
                const artifacts : Artifact[] = (artifactIds && (await this.artifactManager.bulkLoadArtifacts(allArtifactIds)).filter(a => !!a)) ?? [];
                return (artifacts?.length||0>0 ? artifacts?.map((a, index) => `ARTIFACT CONTENT ${index+1} of ${artifacts.length}
    Link: [${a.metadata?.title||"Unknown title"}(${a.id})
    \'\'\'\n${a.content.toString()}\'\'\'\n`)?.join("\n") : undefined) ?? "[NO LOADED ARTIFACTS]";
            } else {
                return "[out of date step]";
            }
        });
    }

    async execute(params: ExecuteParams): Promise<StepResult<FullArtifactStepResponse>> {
        // Get all available artifacts
        const allArtifacts = params.context?.artifacts||[];

        if (!allArtifacts.length) {
            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.FullArtifact,
                    status: 'No artifacts available to retrieve',
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
        
        try {
            const unstructuredResult = await this.modelHelpers.generate({
                message: params.message || params.stepGoal,
                instructions: prompt,
                threadPosts: params.context?.threadPosts,
                modelType: ModelType.REASONING
            });
            prompt.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE_AND_REASONING, schema});

            const json = StringUtils.extractAndParseJsonBlock<ArtifactSelectionResponse>(unstructuredResult.message, schema);
            const thinking = StringUtils.extractXmlBlock(unstructuredResult.message, "thinking");
            
            // Handle index (number or string), UUID string, and string-formatted numbers
            const selectedArtifactIds = json?.artifactIndexes
                .map(selection => {
                    if (typeof selection === 'number') {
                        // Handle 1-based index selection
                        return selection > 0 && selection <= allArtifacts.length 
                            ? allArtifacts[selection - 1].id 
                            : null;
                    } else if (typeof selection === 'string') {
                        if (isUUID(selection)) {
                            // Handle UUID selection
                            return allArtifacts.some(a => a.id === selection)
                                ? selection
                                : null;
                        } else {
                            // Handle string-formatted numbers
                            try {
                                const index = parseInt(selection);
                                return index > 0 && index <= allArtifacts.length
                                    ? allArtifacts[index - 1].id
                                    : null;
                            } catch (error) {
                                return null;
                            }
                        }
                    }
                    return null;
                })
                .filter(id => id !== null) as UUID[] || [];

            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.FullArtifact,
                    status: `Retrieved ${selectedArtifactIds.length} artifacts:\n${thinking}`,
                    data: {
                        selectedArtifactIds,
                        selectionReason: thinking||"[Unknown reason]"
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
