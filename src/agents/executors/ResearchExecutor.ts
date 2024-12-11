import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from '../../llm/lmstudioService';
import LMStudioService from '../../llm/lmstudioService';
import { ModelHelpers } from 'src/llm/helpers';
import { StepExecutor as StepExecutorDecorator } from '../decorators/executorDecorator';
import ChromaDBService from '../../llm/chromaService';
import { CHROMA_COLLECTION } from '../../helpers/config';
import Logger from '../../helpers/logger';

@StepExecutorDecorator('research', 'Research relevant content from knowledge base')
export class ResearchExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private chromaDBService: ChromaDBService;

    constructor(llmService: LMStudioService) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.chromaDBService = new ChromaDBService();
    }

    async execute(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        // First, generate optimal search queries
        const querySchema = {
            type: "object",
            properties: {
                queries: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            query: { type: "string" },
                            rationale: { type: "string" }
                        }
                    }
                }
            },
            required: ["queries"]
        };

        const queryPrompt = `You are a research specialist crafting search queries.
Given this content goal: "${goal}"
Generate 2-3 different search queries that will help find relevant information.
Explain the rationale for each query.`;

        const queryInstructions = new StructuredOutputPrompt(querySchema, queryPrompt);
        const queryResult = await this.modelHelpers.generate({
            message: goal,
            instructions: queryInstructions
        });

        // Execute searches using ChromaDB
        const searchResults = [];
        for (const queryObj of queryResult.queries) {
            try {
                const results = await this.chromaDBService.query(
                    [queryObj.query], 
                    undefined, 
                    5, 
                    CHROMA_COLLECTION
                );
                searchResults.push(...results);
            } catch (error) {
                Logger.error(`Error querying ChromaDB: ${error}`);
            }
        }

        // Analyze search results
        const analysisSchema = {
            type: "object",
            properties: {
                keyFindings: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            finding: { type: "string" },
                            sources: { 
                                type: "array",
                                items: { type: "string" }
                            },
                            relevance: { type: "string" }
                        }
                    }
                },
                gaps: {
                    type: "array",
                    items: { type: "string" }
                },
                recommendations: {
                    type: "string"
                }
            },
            required: ["keyFindings", "gaps", "recommendations"]
        };

        const analysisPrompt = `You are analyzing research results for: "${goal}"

Search Results:
${searchResults.map(r => `
Source: ${r.metadata?.title || 'Untitled'}
Content: ${r.text}
---`).join('\n')}

Analyze these results to:
1. Extract key findings and their sources
2. Identify any information gaps
3. Recommend next steps for content creation`;

        const analysisInstructions = new StructuredOutputPrompt(analysisSchema, analysisPrompt);
        const analysis = await this.modelHelpers.generate({
            message: goal,
            instructions: analysisInstructions
        });

        // Format response
        const responseMessage = `## Research Results

### Search Queries Used
${queryResult.queries.map(q => `- "${q.query}"\n  *Rationale:* ${q.rationale}`).join('\n')}

### Key Findings
${analysis.keyFindings.map(f => `
- **Finding:** ${f.finding}
  - *Sources:* ${f.sources.join(', ')}
  - *Relevance:* ${f.relevance}`).join('\n')}

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
