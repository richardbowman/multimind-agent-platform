import { ModelHelpers } from "src/llm/modelHelpers";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { ReplanType, StepResponse, StepResponseType, StepResult } from "../interfaces/StepResult";
import { CSVUtils, CSVContents } from "src/utils/CSVUtils";
import { ArtifactType, SpreadsheetSubType } from "src/tools/artifact";
import { createUUID } from "src/types/uuid";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { StructuredOutputPrompt } from "src/llm/ILLMService";
import { SchemaType } from "src/schemas/SchemaTypes";
import { ExecutorType } from "../interfaces/ExecutorType";

interface MergePlan {
    artifactIds: string[];
    mergeStrategy: 'union' | 'intersection' | 'specific_columns';
    columnsToKeep?: string[];
    deduplicate: boolean;
}

@StepExecutorDecorator(ExecutorType.CSV_MERGE, 'Merges multiple CSV artifacts into a single spreadsheet')
export class CSVMergeExecutor implements StepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        // Get merge plan from LLM
        const mergePlan = await this.generateMergePlan(params.goal, params.stepGoal, params.artifacts);

        // Load and merge CSV artifacts
        const mergedContents = await this.mergeCSVArtifacts(mergePlan, params.artifacts);

        // Create new merged artifact
        const csvContent = await CSVUtils.toCSV(mergedContents);

        return {
            finished: true,
            type: 'csv_merge_results',
            replan: ReplanType.Allow,
            response: {
                type: StepResponseType.GeneratedArtifact,
                status: `Successfully merged ${mergePlan.artifactIds.length} CSV artifacts`,
                artifacts: [{
                    type: ArtifactType.Spreadsheet,
                    content: csvContent,
                    metadata: {
                        title: `Merged CSV - ${params.stepGoal}`,
                        subtype: SpreadsheetSubType.DataTypes,
                        sourceArtifactIds: mergePlan.artifactIds,
                        mergeStrategy: mergePlan.mergeStrategy,
                        generatedAt: new Date().toISOString()
                    }
                }]
            }
        };
    }

    private async mergeCSVArtifacts(mergePlan: MergePlan, artifacts: any[]): Promise<CSVContents> {
        const mergedContents: CSVContents = {
            metadata: {
                mergeStrategy: mergePlan.mergeStrategy,
                sourceArtifactIds: mergePlan.artifactIds,
                generatedAt: new Date().toISOString()
            },
            rows: []
        };

        // Load and process each artifact
        for (const artifactId of mergePlan.artifactIds) {
            const artifact = artifacts.find(a => a.id === artifactId);
            if (!artifact || artifact.type !== ArtifactType.Spreadsheet) continue;

            const contents = await CSVUtils.fromCSV(artifact.content.toString());
            
            // Filter columns if needed
            const filteredRows = mergePlan.columnsToKeep 
                ? contents.rows.map(row => {
                    const filteredRow: Record<string, any> = {};
                    mergePlan.columnsToKeep!.forEach(col => {
                        if (col in row) filteredRow[col] = row[col];
                    });
                    return filteredRow;
                })
                : contents.rows;

            mergedContents.rows.push(...filteredRows);
        }

        // Deduplicate if requested
        if (mergePlan.deduplicate) {
            const uniqueRows = new Map<string, any>();
            mergedContents.rows.forEach(row => {
                const rowKey = JSON.stringify(row);
                if (!uniqueRows.has(rowKey)) {
                    uniqueRows.set(rowKey, row);
                }
            });
            mergedContents.rows = Array.from(uniqueRows.values());
        }

        return mergedContents;
    }

    private async generateMergePlan(goal: string, task: string, artifacts: any[]): Promise<MergePlan> {
        const schema = await getGeneratedSchema(SchemaType.MergePlanResponse);

        const systemPrompt = `You are a data integration assistant. Our overall goal is ${goal}.
        Consider these specific goals we're trying to achieve: ${task}

        Available Artifacts:
        ${artifacts.map(a => `- ${a.id}: ${a.metadata?.title || 'Untitled'} (${a.type})`).join('\n')}

        Generate a plan for merging CSV artifacts that best supports the goal. Consider:
        - Which artifacts should be merged
        - Whether to keep all columns or specific ones
        - Whether to deduplicate rows
        - The best merge strategy (union, intersection, or specific columns)`;

        const instructions = new StructuredOutputPrompt(schema, systemPrompt);
        const response = await this.modelHelpers.generate<MergePlan>({
            message: `Task: ${task}`,
            instructions
        });

        return response;
    }
}
