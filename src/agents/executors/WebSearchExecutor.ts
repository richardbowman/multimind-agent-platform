import SearchHelper from "src/helpers/searchHelper";
import { ModelHelpers } from "src/llm/modelHelpers";
import { SearchQueryResponse } from "src/schemas/SearchQueryResponse";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { StepResult } from "../interfaces/StepResult";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { SchemaType } from "src/schemas/SchemaTypes";
import { ExecutorType } from "../interfaces/ExecutorType";

@StepExecutorDecorator(ExecutorType.WEB_SEARCH, 'Performs web searches and generates search queries')
export class SearchExecutor implements StepExecutor {
    private searchHelper: SearchHelper;
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.searchHelper = SearchHelper.create(params.settings, params.artifactManager);;
        this.modelHelpers = params.modelHelpers;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const { searchQuery, category } = await this.generateSearchQuery(params.goal, params.stepGoal, params.previousResult);
        const searchResults = await this.searchHelper.search(searchQuery, category);

        return {
            finished: true,
            type: 'search_results',
            response: {
                status: `Found ${searchResults.length} search results`,
                data: {
                    searchResults,
                    query: searchQuery
                }
            }
        };
    }

    private async generateSearchQuery(goal: string, task: string, previousResult?: any): Promise<SearchQueryResponse> {
        const schema = await getGeneratedSchema(SchemaType.SearchQueryResponse);

        const previousFindings = previousResult?.data?.analysis?.keyFindings || [];
        const previousGaps = previousResult?.data?.analysis?.gaps || [];

        const systemPrompt = `You are a research assistant. Our overall goal is ${goal}.
    Consider these specific goals we're trying to achieve: ${task}
    
    Previous Research Findings:
    ${previousFindings.map((f: any) => `- ${f.finding}`).join('\n')}
    
    Identified Gaps:
    ${previousGaps.map((g: string) => `- ${g}`).join('\n')}
    
    Generate a broad web search query without special keywords or operators based on the task and previous findings.
    Focus on filling knowledge gaps and expanding on existing findings.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const response = await this.modelHelpers.generate<SearchQueryResponse>({
            message: `Task: ${task}`,
            instructions
        });

        return response;
    }
}