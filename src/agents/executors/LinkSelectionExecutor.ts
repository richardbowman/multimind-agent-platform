import Logger from "src/helpers/logger";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from "src/llm/modelHelpers";
import { SchemaType } from "src/schemas/SchemaTypes";
import { WebSearchResponse } from "src/schemas/WebSearchResponse";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { StepResult } from "../interfaces/StepResult";
import { ExecutorType } from "../interfaces/ExecutorType";

@StepExecutorDecorator(ExecutorType.SELECT_LINKS, 'Analyzes and selects relevant links to follow')
export class LinkSelectionExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const searchResults = params.previousResult?.map(r => r.data?.searchResults).filter(s => s).slice(-1)[0];

        if (!searchResults) {
            return {
                finished: true,
                response: { message: 'No search results to analyze' }
            };
        }

        const selectedUrls = await this.selectRelevantSearchResults(
            params.stepGoal,
            params.goal,
            searchResults,
            params.previousResult
        );

        return {
            finished: true,
            type: 'selected_links',
            response: {
                message: `Selected ${selectedUrls.length} relevant links`,
                data: { selectedUrls }
            }
        };
    }

    private async selectRelevantSearchResults(
        task: string,
        goal: string,
        searchResults: { title: string, url: string, description: string }[],
        previousResult?: any
    ): Promise<string[]> {
        const schema = await getGeneratedSchema(SchemaType.WebSearchResponse);

        const previousFindings = previousResult?.data?.analysis?.keyFindings || [];

        const prompt = this.modelHelpers.createPrompt();
        prompt.addInstruction(`You are a research assistant. Our overall goal is ${goal}, and we're currently working on researching ${task}.

Previous Research Findings:
${previousFindings.map((f: any) => `- ${f.finding}`).join('\n')}

Given the following web search results, select 1-3 URLs that are most relevant to our goal and would help expand our knowledge beyond what we already know. Don't pick PDFs, we can't scrape them. If you don't think any are relevant, return an empty array.`);

        const instructions = new StructuredOutputPrompt(schema, prompt);
        const message = searchResults
            .slice(0, 10)
            .map((sr, i) => `${i + 1}. Title: ${sr.title}\nURL: ${sr.url}\nDescription: ${sr.description.slice(0, 200)}`)
            .join("\n\n");

            
        const response = await this.modelHelpers.generate<WebSearchResponse>({
            message,
            instructions
        });

        return response.urls.filter(url => typeof url === 'string');
    }
}