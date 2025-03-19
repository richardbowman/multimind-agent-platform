import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { BaseStepExecutor, StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResponseType, StepResult } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { IVectorDatabase, SearchResult } from '../../llm/IVectorDatabase';
import { ILLMService } from '../../llm/ILLMService';
import { QueriesResponse, QuickQueriesResponse, ResearchResponse } from '../../schemas/research';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import Logger from '../../helpers/logger';
import { ExecutorType } from '../interfaces/ExecutorType';
import { Artifact } from 'src/tools/artifact';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { StringUtils } from 'src/utils/StringUtils';
import { asError } from 'src/types/types';

/**
 * Executor that searches and analyzes existing knowledge in the vector database.
 * Key capabilities:
 * - Generates targeted search queries based on research goals
 * - Supports both quick and detailed search modes
 * - Quick mode: Rapid knowledge check with basic query generation
 * - Detailed mode: In-depth analysis with query rationales
 * - Deduplicates search results to avoid redundancy
 * - Extracts and summarizes key findings from relevant sources
 * - Identifies information gaps for further research
 * - Provides structured research reports with sources and relevance scores
 */
@StepExecutorDecorator(ExecutorType.CHECK_KNOWLEDGE, 'Check internal knowledge base for existing artifacts.')
export class KnowledgeCheckExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private vectorDB: IVectorDatabase;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.vectorDB = params.vectorDB!;
        this.modelHelpers.setFinalInstructions(`Use only the provided search results to answer. Do not make up any information.`);
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const mode = params.mode as ('quick' | 'detailed') || 'quick';
        return this.executeQuick(params);
    }

    private async executeQuick(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        try {
            const { stepGoal, goal, projectId, previousResponses, context } = params;
            const querySchema = await getGeneratedSchema(SchemaType.QuickQueriesResponse);


            const queryInstructions = this.startModel(params);
            queryInstructions.addContext({contentType: ContentType.ABOUT});
            queryInstructions.addContext({contentType: ContentType.OVERALL_GOAL, goal});
            queryInstructions.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema: querySchema});

            const queryModelResponse = await queryInstructions.generate({
                message: goal,
                instructions: queryInstructions
            });
            const queryResult = StringUtils.extractAndParseJsonBlock<QuickQueriesResponse>(queryModelResponse, querySchema);
            const queryMessage = StringUtils.extractNonCodeContent(queryModelResponse);

            // Execute searches using our vector DB
            let searchResults : SearchResult[] = [];
            const seenContent = new Set();
            
            for (const query of queryResult.queries) {
                try {
                    const results = await this.vectorDB.query(
                        [query], 
                        undefined, 
                        5
                    );
                    
                    for (const result of results) {
                        if (!seenContent.has(result.text)) {
                            seenContent.add(result.text);
                            searchResults.push(result);
                        }
                    }
                } catch (error) {
                    Logger.error(`Error querying ChromaDB: ${error}`);
                }
            }

            // only include relevant items
            searchResults = searchResults.filter(s => s.score > 0.5);

            const analysisInstructions = this.startModel(params);
            analysisInstructions.addInstruction(`You are a step in an agent. You are helping search for existing information contained in MultiMind's artifact knowledgebase.

    ATTACHED KNOWLEDGE BASE ARTIFACTS:
    ${context?.artifacts?.map((a, i) => `RESULT ${i+1} of ${context.artifacts!.length}:
    - Artifact ID: ${a.id}
    - Title: ${a.metadata?.title}
    ${a.metadata?.summary ? `- Summary: ${a.metadata.summary}` : `- Content: ${a.content.slice(0, 1000)} ${a.content.length > 1000 ? `[truncated, full size is available ${a.content.length}]` : ""}`}
    - Date Created: ${a.metadata?.dateCreated}
    - Version: ${a.metadata?.version}
    ---
    `).join('\n')}


    NOT-ATTACHED SEARCH RESULTS FROM KNOWLEDGE BASE:
    ${searchResults.map(r => `Artifact ID: ${r.metadata?.artifactId}
    Source: ${r.metadata?.title || 'Untitled'} (Score: ${r.score?.toFixed(3)})
    Content: ${r.text}
    ---`).join('\n')}

    Analyze relevant results (skipping irrelevant results):
    1. Extract key findings and their sources from what's provided in the context above.
    2. You do not have direct access to Internet resources or searches. You are searching your internal knowledge base.
    3. ONLY SUMMARIZE FINDINGS PROVIDED ABOVE. DO NOT MAKE UP INFORMATION USING GENERAL KNOWLEDGE.
    4. Include source references including Artifact IDs when available.`);

            // const analysisSchema = await getGeneratedSchema(SchemaType.ResearchResponse);
            const analysisModelResponse = await analysisInstructions.generate({
                message: params.stepGoal
            });

            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.SearchResults,
                    status: analysisModelResponse.message,
                    data: {
                        queries: queryResult.queries,
                        searchResults
                    }
                }
            };
        } catch (error) {
            Logger.error(`Error processing knowledge check: ${asError(error).message}`, error);
            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.Error,
                    status: "Error: Knowledge check failed: ${asError(error).message}. Confirm the step goal is clear if retrying.",
                }
            }            
        }
    }
}
