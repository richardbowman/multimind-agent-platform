import { StepExecutor, StepResult } from '../stepBasedAgent';
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { ILLMService } from '../../llm/ILLMService';
import { ModelHelpers } from 'src/llm/helpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { SchemaType } from '../../schemas/SchemaTypes';
import { ArtifactManager } from '../../tools/artifactManager';
import { IVectorDatabase } from '../../llm/IVectorDatabase';
import { ResearchArtifactResponse } from '../../schemas/research-manager';
import Logger from '../../helpers/logger';

@StepExecutorDecorator('aggregate-research', 'Combine research findings into final report')
export class ResearchAggregationExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;
    private vectorDB: IVectorDatabase;

    constructor(llmService: ILLMService, artifactManager: ArtifactManager, vectorDB: IVectorDatabase) {
        this.modelHelpers = new ModelHelpers(llmService, 'executor');
        this.artifactManager = artifactManager;
        this.vectorDB = vectorDB;
    }

    async execute(goal: string, step: string, projectId: string): Promise<StepResult> {
        const aggregatedData = await this.aggregateResults(projectId);
        const schema = await getGeneratedSchema(SchemaType.ResearchArtifactResponse);

        const systemPrompt = `
You are a research manager. Your team of research assistants have completed web searches to look up information
based on your original requests list. Generate a comprehensive report based on the aggregated data and the user's original prompt.
Make sure to include sources back to the results. Do not make up information missing in the search results.
Make sure you put the entire report inside the artifactContent field in Markdown format.`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const result = await this.modelHelpers.generate<ResearchArtifactResponse>({
            message: `Original Goal: ${goal}\nAggregated Data:\n${aggregatedData}`,
            instructions
        });

        const artifact = await this.artifactManager.saveArtifact({
            id: crypto.randomUUID(),
            type: 'report',
            content: result.artifactContent,
            metadata: {
                title: result.artifactTitle,
                projectId: projectId
            }
        });

        return {
            type: "aggregate-research",
            finished: true,
            response: {
                message: result.message,
                data: {
                    artifactId: artifact.id,
                    ...result
                }
            }
        };
    }

    private async aggregateResults(projectId: string): Promise<string> {
        Logger.info(`Aggregating results for ${projectId}`);

        const queryTexts = [projectId];
        const where: any = {
            "$and": [
                { "type": { "$eq": "summary" } },
                { "projectId": { "$eq": projectId } }
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
