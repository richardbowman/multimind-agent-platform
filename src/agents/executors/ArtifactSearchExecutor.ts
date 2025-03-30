import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResponseType, StepResult } from '../interfaces/StepResult';
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { IVectorDatabase, SearchResult } from '../../llm/IVectorDatabase';
import { ExecutorType } from '../interfaces/ExecutorType';
import { Artifact } from 'src/tools/artifact';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { StringUtils } from 'src/utils/StringUtils';
import { asError } from 'src/types/types';
import Logger from '../../helpers/logger';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';

/**
 * Executor that searches artifacts in the vector database and returns matching documents.
 * Key capabilities:
 * - Performs semantic search on artifacts
 * - Returns ranked list of matching artifacts
 * - Filters results by relevance score
 * - Includes artifact metadata in results
 */
@StepExecutorDecorator(ExecutorType.ARTIFACT_SEARCH, 'Search artifacts and return matching documents')
export class ArtifactSearchExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private vectorDB: IVectorDatabase;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.vectorDB = params.vectorDB!;
        this.modelHelpers.setFinalInstructions(`Return only relevant artifacts from the search results.`);
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        try {
            const { stepGoal, projectId } = params;
            
            // Perform vector search
            const searchResults = await this.vectorDB.query(
                [stepGoal], 
                { projectId }, 
                10
            );

            // Filter by relevance score
            const relevantResults = searchResults.filter(r => r.score > 0.5);

            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.SearchResults,
                    status: `Found ${relevantResults.length} matching artifacts`,
                    data: {
                        searchResults: relevantResults,
                        query: stepGoal
                    }
                }
            };
        } catch (error) {
            Logger.error(`Error searching artifacts: ${asError(error).message}`, error);
            return {
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    type: StepResponseType.Error,
                    status: `Error searching artifacts: ${asError(error).message}`
                }
            };
        }
    }
}
