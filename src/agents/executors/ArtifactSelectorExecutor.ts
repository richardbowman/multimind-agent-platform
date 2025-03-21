import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { BaseStepExecutor, StepExecutor } from "../interfaces/StepExecutor";
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from "../interfaces/StepResult";
import { ArtifactManager } from "src/tools/artifactManager";
import { Artifact, ArtifactType } from "src/tools/artifact";
import { ModelHelpers } from "src/llm/modelHelpers";
import { ContentType, OutputType } from "src/llm/promptBuilder";
import { ModelType } from "src/llm/types/ModelType";
import { ExecutorType } from "../interfaces/ExecutorType";
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { StringUtils } from 'src/utils/StringUtils';
import { ArtifactSelectionResponse } from "src/schemas/ArtifactSelectionResponse";
import { LinkRef } from "src/helpers/scrapeHelper";
import { parse } from 'csv';

export interface ArtifactSelectionStepResponse extends StepResponse {
    type: StepResponseType.WebPage;
    data?: {
        selectedArtifacts: Artifact[];
        selectionReason: string;
        extractedLinks: LinkRef[];
    };
}

@StepExecutorDecorator(ExecutorType.ARTIFACT_SELECTOR, 'Review relevant artifacts from attachments and get all of the embedded links.')
export class ArtifactSelectorExecutor extends BaseStepExecutor<ArtifactSelectionStepResponse> {
    private artifactManager: ArtifactManager;
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.artifactManager = params.artifactManager;
        this.modelHelpers = params.modelHelpers;
    }

    async execute(params: ExecuteParams): Promise<StepResult<ArtifactSelectionStepResponse>> {
        // Get all available artifacts
        const allArtifacts = params.context?.artifacts||[];

        if (!allArtifacts.length) {
            return {
                finished: true,
                response: {
                    type: StepResponseType.WebPage,
                    message: 'No artifacts available to select from',
                    data: {
                        selectedArtifacts: [],
                        selectionReason: 'No artifacts available',
                        extractedLinks: []
                    }
                }
            };
        }

        // Generate structured prompt
        const prompt = this.startModel(params);
        const schema = await getGeneratedSchema(SchemaType.ArtifactSelectionResponse);
        prompt.addInstruction(`Your task is to select the most relevant artifacts from the available collection based on the user's request.`);
        prompt.addContext({contentType: ContentType.PURPOSE});
        prompt.addContext({contentType: ContentType.GOALS_FULL, params});
        prompt.addContext({contentType: ContentType.EXECUTE_PARAMS, params});
        prompt.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: allArtifacts});
        prompt.addInstruction(`The artifactIndexes field should contain the list numbers (1-N) from the ARTIFACTS EXCERPTS above; Include a clear selectionReason explaining why these artifacts were chosen`);
        prompt.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});

        try {
            const unstructuredResult = await prompt.generate({
                message: params.message || params.stepGoal,
                modelType: ModelType.REASONING
            });

            const json = StringUtils.extractAndParseJsonBlock<ArtifactSelectionResponse>(unstructuredResult.message, schema);
            
            // Convert indexes to artifact IDs (indexes are 1-based)
            const selectedArtifacts = json?.artifactIndexes
                .filter(index => index > 0 && index <= allArtifacts.length)
                .map(index => allArtifacts[index - 1])||[];

            // Extract links from all selected artifacts
            const allLinks : LinkRef[] = selectedArtifacts.flatMap(artifact => {
                if (artifact.type === ArtifactType.Spreadsheet) {
                    try {
                        // Parse CSV content
                        const records = parse(artifact.content.toString(), {
                            columns: true,
                            skip_empty_lines: true
                        });
                        
                        // Extract links from all columns that might contain URLs
                        return records.flatMap(record => 
                            Object.values(record).flatMap(value => 
                                StringUtils.extractUrls(value?.toString() || '')
                            ).map(link => ({ href: link } as LinkRef))
                        );
                    } catch (error) {
                        console.error('Error parsing CSV artifact:', error);
                        return [];
                    }
                } else {
                    // Handle markdown/text content
                    return StringUtils.extractLinksFromMarkdown(artifact.content.toString());
                }
            });

            return {
                finished: true,
                type: StepResultType.WebScrapeStepResult,
                replan: ReplanType.Allow,
                artifactIds: selectedArtifacts.map(a => a.id),
                response: {
                    type: StepResponseType.WebPage,
                    status: `I've successfully reviewed the document and found ${selectedArtifacts.length} artifacts containing ${allLinks.length} links:\n
${json.selectionReason}. Now I need to select the relevant links from the links in the document. My next step would typically be [${ExecutorType.SELECT_LINKS}]`,
                    data: {
                        selectedArtifacts,
                        selectionReason: json?.selectionReason||"[Unknown reason]",
                        extractedLinks: allLinks
                    }
                }
            };
        } catch (error) {
            return {
                finished: true,
                replan: ReplanType.Allow,
                needsUserInput: true,
                response: {
                    type: StepResponseType.WebPage,
                    message: 'Failed to select artifacts. Please try again later.'
                }
            };
        }
    }
}
