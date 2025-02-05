import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { StepResult } from '../interfaces/StepResult';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import crypto from 'crypto';
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ArtifactManager } from '../../tools/artifactManager';
import { IVectorDatabase } from '../../llm/IVectorDatabase';
import { ResearchArtifactResponse } from '../../schemas/research-manager';
import Logger from '../../helpers/logger';
import { ExecutorType } from '../interfaces/ExecutorType';
import { StringUtils } from 'src/utils/StringUtils';

/**
 * Executor that combines and synthesizes research findings into comprehensive reports.
 * Key capabilities:
 * - Aggregates results from multiple research tasks
 * - Synthesizes findings into coherent narratives
 * - Maintains source attribution and citations
 * - Generates structured research reports
 * - Handles both summary and detailed reporting modes
 * - Supports vector database querying for context
 * - Manages artifact creation and storage
 * - Provides relevance scoring for sources
 * - Creates clear section organization
 * - Ensures consistent formatting and style
 */
@StepExecutorDecorator(ExecutorType.RESEARCH_AGGREGATION, 'Combine research findings into final report')
export class ResearchAggregationExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;
    private vectorDB: IVectorDatabase;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;

        this.artifactManager = params.artifactManager!;
        this.vectorDB = params.vectorDB!;
    }

    async executeOld(goal: string, step: string, projectId: string, previousResponses?: any[]): Promise<StepResult<StepResponse>> {
        const aggregatedData = await this.aggregateResults(goal, projectId);
        const schema = await getGeneratedSchema(SchemaType.ResearchArtifactResponse);

        const instructions = `
You are a research manager. Your team of research assistants have completed web searches to look up information
based on your original requests list. Generate a comprehensive report based on the aggregated data and the user's original prompt.
Make sure to include sources back to the results. Do not make up information missing in the search results.

Specify the title like this:

Report Title: XXX

And put the report inside of \`\`\`markdown tags.`;

        // const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        // Generate the research report with token tracking
        const result = await this.modelHelpers.generate({
            message: `Original Goal: ${goal}\nAggregated Data:\n${aggregatedData}`,
            instructions
        });

        const title = StringUtils.extractCaptionedText(result.message, "Report Title")
        const docBlocks = StringUtils.extractCodeBlocks(result.message);
        const message = StringUtils.extractNonCodeContent(result.message);

        if (docBlocks.length > 0) {
            const artifact = await this.artifactManager.saveArtifact({
                type: 'report',
                content: docBlocks.length>0?docBlocks[0].code:"(No content provided)",
                tokenCount: result._usage?.outputTokens,
                metadata: {
                    title: title,
                    projectId: projectId,
                    tokenUsage: result._usage
                }
            });

            return {
                type: "aggregate-research",
                finished: true,
                response: {
                    message,
                    data: {
                        artifactId: artifact.id,
                        ...result
                    }
                }
            };
        } else {
            return {
                type: "aggregate-research",
                finished: false,
                needsUserInput: true,
                response: {
                    message: message
                }
            };
        }
    }

    private async aggregateResults(goal: string, projectId: string): Promise<string> {
        Logger.info(`Aggregating results for ${projectId}`);

        const queryTexts = [goal];
        const where: any = {
            "$and": [
                { "type": { "$eq": "summary" } },
                //{ "projectId": { "$eq": projectId } }
            ]
        };
        const nResults = 20;

        try {
            const response = await this.vectorDB.query(queryTexts, where, nResults);
            response.sort((a, b) => b.score - a.score);

            return response.map((r, index) =>
                `<search result="${index + 1}">
Title: ${r.metadata.title}
URL: ${r.metadata.url}
Chunk: ${r.metadata.chunkId} of ${r.metadata.chunkTotal}
Relevancy Score: ${Math.round(r.score * 1000) / 10}
Chunk ID: ${r.id}
Document ID: ${r.metadata.docId}
Content Excerpt: ${r.text}
</search>`).join("\n\n");
        } catch (error) {
            Logger.error('Error querying vector database:', error);
            throw error;
        }
    }
}
