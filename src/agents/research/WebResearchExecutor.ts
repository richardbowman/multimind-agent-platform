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
    // ... other methods remain the same ...

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

    // ... rest of the class remains the same ...
}
