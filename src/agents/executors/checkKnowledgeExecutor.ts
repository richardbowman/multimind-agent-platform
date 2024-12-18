import { ExecuteParams, StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { IVectorDatabase } from '../../llm/IVectorDatabase';
import { ILLMService } from '../../llm/ILLMService';
import { QueriesResponse, ResearchResponse } from '../../schemas/research';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import Logger from '../../helpers/logger';

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
@StepExecutorDecorator('check-knowledge', 'Check my existing knowledgebase (useful to do upfront)')
export class KnowledgeCheckExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private vectorDB: IVectorDatabase;

    constructor(llmService: ILLMService, vectorDB: IVectorDatabase) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.vectorDB = vectorDB;
        this.modelHelpers.setPurpose(`You are a research specialist crafting search queries.`);
        this.modelHelpers.setFinalInstructions(`Use only the provided search results to answer. Do not make up any information.`);
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        const mode = params.mode as ('quick' | 'detailed') || 'quick';
        return mode === 'quick' ? 
            this.executeQuick(params.goal, params.step, params.projectId, params.previousResult) : 
            this.executeDetailed(params.goal, params.step, params.projectId, params.previousResult);
    }

    private async executeQuick(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
        const querySchema = await getGeneratedSchema(SchemaType.QuickQueriesResponse);

        const queryPrompt = `Given this content goal: "${goal}"
Generate 2-3 different search queries that will help find relevant information.`;

        const queryInstructions = new StructuredOutputPrompt(querySchema, queryPrompt);
        const queryResult = await this.modelHelpers.generate<{queries: string[]}>({
            message: goal,
            instructions: queryInstructions
        });

        // Execute searches using our vector DB
        const searchResults = [];
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

        const analysisPrompt = `You are analyzing research results for: "${goal}"

Search Results:
${searchResults.map(r => `
Source: ${r.metadata?.title || 'Untitled'} (Score: ${r.score?.toFixed(3)})
Content: ${r.text}
---`).join('\n')}

Analyze relevant results (skipping irrelevant results):
1. Extract key findings and their sources
2. Identify any information gaps`;

        const schema = await getGeneratedSchema(SchemaType.ResearchResponse);
        const analysisInstructions = new StructuredOutputPrompt(schema, analysisPrompt);
        const analysis = await this.modelHelpers.generate<ResearchResponse>({
            message: goal,
            instructions: analysisInstructions
        });

        const responseMessage = `## Quick Research Results

### Search Queries Used
${queryResult.queries.map(q => `- "${q}"`).join('\n')}

### Key Findings
${analysis.keyFindings?.map(f => `
- **Finding:** ${f.finding}
  - *Sources:* ${f.sources.join(', ')}
  - *Relevance:* ${f.relevance}`).join('\n')||"(None found)"}

### Information Gaps
${analysis.gaps.map(gap => `- ${gap}`).join('\n')}`;

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

    private async executeDetailed(goal: string, step: string, projectId: string, previousResult?: any): Promise<StepResult> {
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

Analyze relevant results (skipping irrelevant results):
1. Extract key findings and their sources
2. Identify any information gaps`;

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
${analysis.gaps.map(gap => `- ${gap}`).join('\n')}`;

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
