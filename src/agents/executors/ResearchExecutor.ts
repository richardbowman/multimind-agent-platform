import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from '../../llm/helpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { IVectorDatabase } from '../../llm/IVectorDatabase';
import { ILLMService } from '../../llm/ILLMService';
import { QueriesResponse, ResearchResponse } from '../../schemas/research';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import Logger from '../../helpers/logger';

@StepExecutorDecorator('check-knowledge', 'Check my existing knowledgebase (useful to do upfront)')
export class KnowledgeCheckExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private vectorDB: IVectorDatabase;

    constructor(llmService: ILLMService, vectorDB: IVectorDatabase) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.vectorDB = vectorDB;
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const querySchema = await getGeneratedSchema(SchemaType.QueriesResponse);
        const schema = await getGeneratedSchema(SchemaType.ResearchResponse);

        const queryPrompt = `You are a research specialist crafting search queries.
Given this content goal: "${goal}"
Generate 2-3 different search queries that will help find relevant information.
Explain the rationale for each query.`;

        const queryInstructions = new StructuredOutputPrompt(querySchema, queryPrompt);
        const queryResult = await this.modelHelpers.generate<QueriesResponse>({
            message: goal,
            instructions: queryInstructions
        });

        // Execute searches using our vector DB
        const searchResults = [];
        const seenContent = new Set();
        
        for (const queryObj of queryResult.queries) {
            try {
                const results = await this.vectorDB.query(
                    [queryObj.query], 
                    undefined, 
                    5
                );
                
                // Only add unique results based on content
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


        const analysisPrompt = `You are analyzing research results for: "${goal}"

Search Results:
${searchResults.map(r => `
Source: ${r.metadata?.title || 'Untitled'} (Score: ${r.score?.toFixed(3)})
Content: ${r.text}
---`).join('\n')}

Analyze relevant results (and ignore irrelevant results):
1. Extract key findings and their sources
2. Identify any information gaps
3. Recommend next steps for content creation`;

        const analysisInstructions = new StructuredOutputPrompt(schema, analysisPrompt);
        const analysis = await this.modelHelpers.generate<ResearchResponse>({
            message: goal,
            instructions: analysisInstructions
        });

        // Format response
        const responseMessage = `## Research Results

### Search Queries Used
${queryResult.queries.map(q => `- "${q.query}"\n  *Rationale:* ${q.rationale}`).join('\n')}

### Key Findings
${analysis.keyFindings?.map(f => `
- **Finding:** ${f.finding}
  - *Sources:* ${f.sources.join(', ')}
  - *Relevance:* ${f.relevance}`).join('\n')||"(None found)"}

### Information Gaps
${analysis.gaps.map(gap => `- ${gap}`).join('\n')}

### Recommendations
${analysis.recommendations}`;

        return {
            type: "research",
            finished: true,
            response: {
                message: responseMessage,
                data: {
                    queries: queryResult.queries,
                    searchResults,
                    analysis
                }
            }
        };
    }
}
