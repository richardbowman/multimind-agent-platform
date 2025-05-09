import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { ModelHelpers } from "src/llm/modelHelpers";
import { SchemaType } from "src/schemas/SchemaTypes";
import { WebSearchResponse } from "src/schemas/WebSearchResponse";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { ReplanType, StepResponse, StepResult } from "../interfaces/StepResult";
import { ExecutorType } from "../interfaces/ExecutorType";
import { LinkRef } from "src/helpers/scrapeHelper";
import { Settings } from "src/tools/settings";
import { StringUtils } from "src/utils/StringUtils";
import { OutputType } from "src/llm/promptBuilder";

@StepExecutorDecorator(ExecutorType.SELECT_LINKS, 'Analyzes and selects relevant links to follow')
export class LinkSelectionExecutor implements StepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private settings: Settings;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.settings = params.settings;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        // Get all previously scraped URLs from WebScrapeExecutor results
        const alreadyScrapedUrls = new Set(
            params.previousResponses?.flatMap(r => r.data?.artifacts?.map(a => a.metadata?.url))
                .filter(u => u) || []
        );

        // Filter search results and scraped links to remove already scraped URLs
        const searchResults = params.previousResponses
            ?.map(r => r.data?.searchResults)
            .filter(s => s)
            .slice(-1)[0]
            ?.filter(sr => !alreadyScrapedUrls.has(sr.url));

        // Deduplicate links based on href property
        const uniqueLinksMap = new Map<string, LinkRef>();
        params.previousResponses
            ?.map(r => r.data?.extractedLinks)
            .flat()
            .filter(s => s && !alreadyScrapedUrls.has(s.href))
            .forEach(link => {
                if (!uniqueLinksMap.has(link.href)) {
                    uniqueLinksMap.set(link.href, link);
                }
            });
        const scrapedPageLinks = Array.from(uniqueLinksMap.values());

        if (!searchResults && scrapedPageLinks.length == 0) {
            return {
                finished: true,
                response: { message: 'No search results or prior page links to analyze' }
            };
        }

        const selectedUrls = await this.selectRelevantSearchResults(
            params.stepGoal,
            params.goal,
            searchResults,
            scrapedPageLinks
        );

        return {
            finished: true,
            type: 'selected_links',
            replan: ReplanType.Allow,
            response: {
                status: `Selected ${selectedUrls.length} relevant links`,
                data: { selectedUrls }
            }
        };
    }

    private async selectRelevantSearchResults(
        task: string,
        goal: string,
        searchResults: { title: string, url: string, description: string }[],
        previousLinks?: LinkRef[]
    ): Promise<string[]> {
        const schema = await getGeneratedSchema(SchemaType.WebSearchResponse);

        const instructions = this.modelHelpers.createPrompt();
        instructions.addInstruction(`You are a research assistant. Our overall goal is ${goal}, and we're currently working on researching ${task}.

Given the following web search results and links from existing pages you've scraped, select 1-${this.settings.maxSelectedLinks} URLs that are most relevant to our goal and would help expand our knowledge beyond what we already know. Don't pick PDFs, we can't scrape them. If you don't think any are relevant, return an empty array.`);

        const message = `Links from previously scraped pages:
${previousLinks?.map(l => `- ${l.href}: ${l.text}`).join('\n') || "(No previous scraped page results)"}

${searchResults&&`Search Results (${searchResults.length} found}):
${searchResults && searchResults
                .slice(0, 10)
                .map((sr, i) => `${i + 1}. Title: ${sr.title}\nURL: ${sr.url}\nDescription: ${StringUtils.truncateWithEllipsis(sr.description, 200)}`)
                .join("\n\n")}`}`;

        instructions.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});

        const rawResponse = await this.modelHelpers.generateMessage({
            message,
            instructions
        });

        const response = StringUtils.extractAndParseJsonBlock<WebSearchResponse>(rawResponse.message, schema);

        return response?.urls.filter(url => typeof url === 'string')||[];
    }
}
