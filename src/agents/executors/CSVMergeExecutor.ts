import { ModelHelpers } from "src/llm/modelHelpers";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from "../interfaces/StepResult";
import { CSVUtils, CSVContents } from "src/utils/CSVUtils";
import { Artifact, ArtifactType, SpreadsheetSubType } from "src/tools/artifact";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { SchemaType } from "src/schemas/SchemaTypes";
import { ExecutorType } from "../interfaces/ExecutorType";
import { MergePlanResponse } from "src/schemas/MergePlanResponse";
import { StringUtils } from "src/utils/StringUtils";
import { ContentType, OutputType } from "src/llm/promptBuilder";


@StepExecutorDecorator(ExecutorType.CSV_MERGE, 'Merges multiple CSV artifacts into a single spreadsheet')
export class CSVMergeExecutor implements StepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        // Get merge plan from LLM
        const mergePlan = await this.generateMergePlan(params.goal, params.stepGoal, params.context?.artifacts||[]);

        if (!mergePlan) {
            return {
                type: StepResultType.Error,
                response: {
                    message: 'Could not generate merge plan'
                }
            };
        }

        // Load and merge CSV artifacts
        const mergedContents = await this.mergeCSVArtifacts(mergePlan, params.context?.artifacts||[]);

        // Create new merged artifact
        const csvContent = await CSVUtils.toCSV(mergedContents);

        return {
            finished: true,
            type: 'csv_merge_results',
            replan: ReplanType.Allow,
            response: {
                type: StepResponseType.GeneratedArtifact,
                status: `Successfully merged ${mergedContents.metadata.sourceArtifactIds.length} CSV artifacts`,
                artifacts: [{
                    type: ArtifactType.Spreadsheet,
                    content: csvContent,
                    metadata: {
                        title: `Merged CSV - ${params.stepGoal}`,
                        subtype: mergedContents.metadata.subtype,
                        sourceArtifactIds: mergedContents.metadata.sourceArtifactIds,
                        mergeStrategy: mergePlan.mergeStrategy,
                        generatedAt: new Date().toISOString()
                    }
                }]
            }
        };
    }

    private async mergeCSVArtifacts(mergePlan: MergePlanResponse, artifacts: Artifact[]): Promise<CSVContents> {
        const mergedArtifacts : Artifact[] = [];
        const mergedContents: CSVContents = {
            metadata: {
                mergeStrategy: mergePlan.mergeStrategy,
                sourceArtifactIds: [],
                generatedAt: new Date().toISOString()
            },
            rows: []
        };

        // Load and process each artifact
        for (const artifactIndex of mergePlan.artifactIndexes) {
            const artifact = artifacts[artifactIndex-1];

            if (!artifact || artifact.type !== ArtifactType.Spreadsheet) continue;

            mergedContents.metadata.sourceArtifactIds.push(artifact.id);
            mergedArtifacts.push(artifact);

            const contents = await CSVUtils.fromCSV(artifact.content.toString());
            
            // Filter columns if needed
            const filteredRows = mergePlan.columnsToKeep?.length||0 > 0
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

        mergedContents.metadata.subtype = this.getCommonSubtype(mergedArtifacts);

        return mergedContents;
    }

    private getCommonSubtype(artifacts: Artifact[]): SpreadsheetSubType {
        // Get all subtypes from spreadsheet artifacts
        const subtypes = artifacts
            .filter(a => a.type === ArtifactType.Spreadsheet)
            .map(a => a.metadata?.subtype)
            .filter(Boolean);
            
        // If all subtypes are the same, use that one
        if (subtypes.length > 0 && new Set(subtypes).size === 1) {
            return subtypes[0];
        }
        
        // Default to Other if no common subtype
        return SpreadsheetSubType.General;
    }

    private async generateMergePlan(goal: string, task: string, artifacts: Artifact[]): Promise<MergePlanResponse|undefined> {
        const schema = await getGeneratedSchema(SchemaType.MergePlanResponse);


        const instructions = this.modelHelpers.createPrompt();

        instructions.addContext({contentType: ContentType.PURPOSE});
        instructions.addContext({contentType: ContentType.STEP_GOAL, goal: goal});

        instructions.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts})

        instructions.addInstruction(`Generate a plan for merging CSV artifacts that best supports the goal. Consider:
        - Which artifacts should be merged
        - Whether to keep all columns or specific ones
        - Whether to deduplicate rows
        - The best merge strategy (union, intersection, or specific columns)`);

        instructions.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});


        const rawResponse = await this.modelHelpers.generateMessage({
            message: `Task: ${task}`,
            instructions
        });

        const response = StringUtils.extractAndParseJsonBlock<MergePlanResponse>(rawResponse.message, schema);

        return response;
    }
}
