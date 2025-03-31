import SearchHelper from "src/helpers/searchHelper";
import { ModelHelpers } from "src/llm/modelHelpers";
import { SearchQueryResponse } from "src/schemas/SearchQueryResponse";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { ReplanType, StepResponse, StepResponseType, StepResult } from "../interfaces/StepResult";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { SchemaType } from "src/schemas/SchemaTypes";
import { ExecutorType } from "../interfaces/ExecutorType";
import { OutputType } from "src/llm/promptBuilder";
import { StringUtils } from "src/utils/StringUtils";
import { withRetry } from "src/helpers/retry";

@StepExecutorDecorator(ExecutorType.WEB_SEARCH, 'Performs web searches and generates search queries')
export class WebSearchExecutor extends BaseStepExecutor<StepResponse> {
    private searchHelper: SearchHelper;
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.searchHelper = SearchHelper.create(params.settings, params.artifactManager);;
        this.modelHelpers = params.modelHelpers;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const { search, message } = await this.generateSearchQuery(params);
        const searchResults = await withRetry(() => {
            return this.searchHelper.search(search.searchQuery, search.category);
        }, () => true, { timeoutMs: 180000, maxAttempts: 2});

        return {
            finished: true,
            replan: ReplanType.Allow,
            response: {
                status: `Notes on query generation: ${message}. Query found ${searchResults.length} possible links (still need to select best links and download page content)`,
                type: StepResponseType.SearchResults,
                data: {
                    searchResults,
                    query: search.searchQuery
                }
            }
        };
    }

    private async generateSearchQuery(params: ExecuteParams): Promise<{search: SearchQueryResponse, message: string}> {
        const { goal, stepGoal, previousResponses } = params;
        const schema = await getGeneratedSchema(SchemaType.SearchQueryResponse);

        const previousFindings = previousResponses?.map(r => r.data?.analysis?.keyFindings) || [];
        const previousGaps = previousResponses?.map(r => r.data?.analysis?.gaps) || [];

        const prompt = this.startModel(params);
        prompt.addInstruction(`You are a research assistant. Our overall goal is ${goal}.  
Previous Research Findings:
${previousFindings.filter(f => !!f).map((f: any) => `- ${f.finding}`).join('\n')}

Identified Gaps:
${previousGaps.filter(f => !!f).map((g: string) => `- ${g}`).join('\n')}

Generate a broad web search query without special keywords or operators based on the task and previous findings.
Focus on filling knowledge gaps and expanding on existing findings.`);
        prompt.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});

        const rawResponse = await prompt.generate({
            message: `Task: ${stepGoal}`,
        });
        const search = StringUtils.extractAndParseJsonBlock<SearchQueryResponse>(rawResponse, schema);
        const message = StringUtils.extractNonCodeContent(rawResponse);

        return {
            search, 
            message
        };
    }
}