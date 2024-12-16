import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import SearchHelper, { DuckDuckGoProvider } from '../../helpers/searchHelper';
import ScrapeHelper from '../../helpers/scrapeHelper';
import { ILLMService, StructuredOutputPrompt } from "src/llm/ILLMService";
import Logger from '../../helpers/logger';
import crypto from 'crypto';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ArtifactManager } from 'src/tools/artifactManager';
import { ModelMessageResponse } from 'src/schemas/ModelResponse';
import { WebSearchResponse } from '../../schemas/WebSearchResponse';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';

@StepExecutorDecorator('web_search', 'Performs web searches and summarizes results')
export class WebSearchExecutor implements StepExecutor {
    private searchHelper: SearchHelper;
    private scrapeHelper: ScrapeHelper;
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;

    constructor(
        llmService: ILLMService,
        searchProvider: DuckDuckGoProvider = new DuckDuckGoProvider()
    ) {
        this.searchHelper = new SearchHelper(searchProvider);
        this.scrapeHelper = new ScrapeHelper();
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.artifactManager = new ArtifactManager();
    }

    private async selectRelevantSearchResults(
        task: string,
        goal: string,
        searchResults: { title: string, url: string, description: string }[],
        previousResult?: any
    ): Promise<string[]> {
        const schema = await getGeneratedSchema(SchemaType.WebSearchResponse);

        const previousFindings = previousResult?.data?.analysis?.keyFindings || [];
        
        const systemPrompt = `You are a research assistant. Our overall goal is ${goal}, and we're currently working on researching ${task}.

Previous Research Findings:
${previousFindings.map((f: any) => `- ${f.finding}`).join('\n')}

Given the following web search results, select 1-3 URLs that are most relevant to our goal and would help expand our knowledge beyond what we already know. Don't pick PDFs, we can't scrape them.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const message = searchResults
            .slice(0, 8)
            .map((sr, i) => `${i + 1}. Title: ${sr.title}\nURL: ${sr.url}\nDescription: ${sr.description.slice(0, 200)}`)
            .join("\n\n");

        const response = await this.modelHelpers.generate<WebSearchResponse>({
            message,
            instructions
        });

        // Handle potential malformed responses
        if (!response.urls || !Array.isArray(response.urls)) {
            Logger.warn('Received malformed URL response from LLM', response);
            return [];
        }

        return response.urls.filter(url => typeof url === 'string');
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const searchQuery = await this.modelHelpers.generate<ModelMessageResponse>({
            message: `Create a precise search query to help research: ${goal}`,
            instructions: {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Concise search query' }
                }
            }
        });

        const searchResults = await this.searchHelper.search(searchQuery.message, 8);
        
        const selectedUrls = await this.selectRelevantSearchResults(step, goal, searchResults, previousResult);
        
        const scrapedResults = await Promise.all(
            selectedUrls.map(url => this.scrapeHelper.scrape(url))
        );

        const analysisPrompt = `Analyze the following web search results in the context of our goal: ${goal}

Search Results:
${scrapedResults.map((result, i) => `URL: ${selectedUrls[i]}\nContent: ${result.slice(0, 500)}...`).join('\n\n')}`;

        const analysis = await this.modelHelpers.generate<ModelMessageResponse>({
            message: analysisPrompt,
            instructions: {
                type: 'object',
                properties: {
                    keyFindings: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                finding: { type: 'string' },
                                confidence: { type: 'number' }
                            }
                        }
                    }
                }
            }
        });

        const artifactId = crypto.randomBytes(16).toString('hex');
        await this.artifactManager.saveArtifact(projectId, artifactId, {
            type: 'web_research',
            data: {
                goal,
                step,
                searchQuery: searchQuery.message,
                urls: selectedUrls,
                analysis: analysis
            }
        });

        return {
            type: 'web_search',
            finished: true,
            response: {
                message: analysis.keyFindings.map(f => f.finding).join('\n'),
                urls: selectedUrls
            },
            data: {
                artifactId
            }
        };
    }
}
