import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResult } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ModelHelpers } from '../../llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { IVectorDatabase, SearchResult } from '../../llm/IVectorDatabase';
import { ILLMService } from '../../llm/ILLMService';
import { QueriesResponse, ResearchResponse } from '../../schemas/research';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import Logger from '../../helpers/logger';
import { ExecutorType } from '../interfaces/ExecutorType';
import { Artifact } from 'src/tools/artifact';

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
@StepExecutorDecorator(ExecutorType.CHECK_KNOWLEDGE, 'Check my existing knowledgebase (useful to do upfront)')
export class KnowledgeCheckExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private vectorDB: IVectorDatabase;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.vectorDB = params.vectorDB!;
        this.modelHelpers.setFinalInstructions(`Use only the provided search results to answer. Do not make up any information.`);
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        const mode = params.mode as ('quick' | 'detailed') || 'quick';
        return this.executeQuick(params.stepGoal||params.message||params.goal, params.goal, params.step, params.projectId, params.previousResponses, params.context?.artifacts);
    }

    private async executeQuick(stepInstructions: string, goal: string, stepType: string, projectId: string, previousResponses?: any, artifacts?: Artifact[]): Promise<StepResult<StepResponse>> {
        const querySchema = await   getGeneratedSchema(SchemaType.QuickQueriesResponse);

        const queryPrompt = `Agent Purpose: ${this.modelHelpers.getPurpose()}. Given the overall goal and the user's request, generate 2-3 different search queries that will help find relevant information.
        Overall Goal : ${goal}
        `;

        const queryInstructions = new StructuredOutputPrompt(querySchema, queryPrompt);
        const queryResult = await this.modelHelpers.generate<{queries: string[]}>({
            message: goal,
            instructions: queryInstructions
        });

        // Execute searches using our vector DB
        let searchResults : SearchResult[] = [];
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

        // only include relevant items
        searchResults = searchResults.filter(s => s.score > 0.5);

        const analysisPrompt = `Your are a step in an agent. Agent's purpose: ${this.modelHelpers.getPurpose()}. You are helping search for existing information for: "${goal}"

ATTACHED KNOWLEDGE BASE ARTIFACTS:
${artifacts?.map(a => `ID: ${a.id}
Title: ${a.metadata?.title}
Content: ${a.content.slice(0, 1000)} ${a.content.length > 1000 ? `[truncated, full size is available ${a.content.length}]` : ''}
Date Created: ${a.metadata?.dateCreated}
Date Created: ${a.metadata?.version}
---
`).join('\n')}


NOT-ATTACHED SEARCH RESULTS FROM KNOWLEDGE BASE:
${searchResults.map(r => `
Source: ${r.metadata?.title || 'Untitled'} (Score: ${r.score?.toFixed(3)})
Content: ${r.text}
---`).join('\n')}

Analyze relevant results (skipping irrelevant results):
1. Extract key findings and their sources only from what's provided (do not make up information)
2. Identify any information gaps`;

        // const schema = await getGeneratedSchema(SchemaType.ResearchResponse);
        // const analysisInstructions = new StructuredOutputPrompt(schema, analysisPrompt);
        const analysis = await this.modelHelpers.generate({
            message: stepInstructions,
            instructions: analysisPrompt
        });

//         const responseMessage = `## Existing Knowlegdebase Results (Quick)

// ### Search Queries Used
// ${queryResult.queries.map(q => `- "${q}"`).join('\n')}

// ### Key Findings
// ${analysis.keyFindings?.map(f => `
// - **Finding:** ${f.finding}
//   - *Sources:* ${f.sources.join(', ')}
//   - *Relevance:* ${f.relevance}`).join('\n')||"(None found)"}

// ### Information Gaps
// ${analysis.gaps.map(gap => `- ${gap}`).join('\n')}`;

        return {
            type: "research",
            finished: true,
            replan: ReplanType.Allow,
            response: {
                message: analysis.message,
                data: {
                    queries: queryResult.queries,
                    searchResults
                }
            }
        };
    }
}
