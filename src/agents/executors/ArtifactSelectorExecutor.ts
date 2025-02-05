import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from "../interfaces/StepResult";
import { ArtifactManager } from "src/tools/artifactManager";
import { Artifact, ArtifactType } from "src/tools/artifact";
import { ModelHelpers } from "src/llm/modelHelpers";
import { ContentType } from "src/llm/promptBuilder";
import { ModelType } from "src/llm/LLMServiceFactory";
import { ExecutorType } from "../interfaces/ExecutorType";
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { StringUtils } from 'src/utils/StringUtils';
import JSON5 from 'json5';
import { ArtifactSelectionResponse } from "src/schemas/ArtifactSelectionResponse";
import { LinkRef } from "src/helpers/scrapeHelper";
import { marked } from "marked";
import { parse } from 'csv-parse/sync';

export interface ArtifactSelectionStepResponse extends StepResponse {
    type: StepResponseType.WebPage;
    data?: {
        selectedArtifacts: Artifact[];
        selectionReason: string;
        extractedLinks: LinkRef[];
    };
}

@StepExecutorDecorator(ExecutorType.ARTIFACT_SELECTOR, 'Review relevant artifacts from attachments and get all of the embedded links.')
export class ArtifactSelectorExecutor implements StepExecutor<ArtifactSelectionStepResponse> {
    private artifactManager: ArtifactManager;
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
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
                model: ModelType.REASONING
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
                    message: `I've successfully reviewed the document and found ${selectedArtifacts.length} artifacts containing ${allLinks.length} links:\n
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
