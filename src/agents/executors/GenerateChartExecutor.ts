import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResponse, StepResponseType, StepResult, StepResultType } from '../interfaces/StepResult';
import { ModelMessageResponse } from '../../schemas/ModelResponse';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact } from 'src/tools/artifact';
import Logger from '../../helpers/logger';
import { ExecutorType } from '../interfaces/ExecutorType';
import { BarChartData } from 'src/schemas/BarChartData';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { StringUtils } from 'src/utils/StringUtils';
import { ContentType } from 'src/llm/promptBuilder';

export interface ChartResponse extends StepResponse {
    data?: BarChartData;
}

/**
 * Executor that generates and manages chart data artifacts.
 * Key capabilities:
 * - Creates new chart data artifacts in structured formats
 * - Supports bar chart generation with configurable axes and series
 * - Handles both creation and update workflows
 * - Generates appropriate titles and metadata
 * - Manages artifact storage and retrieval
 * - Provides confirmation messages for operations
 * - Handles errors gracefully with logging
 */
@StepExecutorDecorator(ExecutorType.GENERATE_CHART, 'Create/revise bar charts')
export class GenerateChartExecutor implements StepExecutor<ChartResponse> {
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.artifactManager = params.artifactManager!;
    }

    async execute(params: ExecuteParams): Promise<StepResult<ChartResponse>> {
        const promptBuilder = this.modelHelpers.createPrompt();

        // Add core instructions
        promptBuilder.addInstruction("Generate or modify chart data based on the goal.");
        promptBuilder.addInstruction(`You have these options:
1. Create NEW chart data (leave artifactId blank and set operation to "create")
2. Replace EXISTING chart data (specify artifactId and set operation to "replace")`);

        promptBuilder.addInstruction(`Provide:
- artifactId: ID of chart to modify (only required for replace operation)
- operation: Must be "create" for new charts, "replace" for existing ones
- title: Chart title
- type: Must be "bar-chart"`);

        promptBuilder.addInstruction(`CHART DATA FORMATTING RULES:
- Use the BarChartData schema for structured output
- Include clear axis labels and categories
- Provide meaningful series names
- Ensure data values are numeric`);

        // Add execution parameters
        promptBuilder.addContext({contentType: ContentType.EXECUTE_PARAMS, params});

        // Add previous results if available
        if (params.previousResponses) {
            promptBuilder.addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses});
        }

        const schema = await getGeneratedSchema(SchemaType.BarChartData);

        promptBuilder.addInstruction(`OUTPUT INSTRUCTIONS:
1. Provide the chart data in a JSON code block that matches this schema:
${JSON.stringify(schema, null, 2)}`);

        try {
            const unstructuredResult = await this.modelHelpers.generate<ModelMessageResponse>({
                message: params.message || params.stepGoal,
                instructions: promptBuilder,
                threadPosts: params.context?.threadPosts
            });

            // Parse and validate the chart data
            const chartData = StringUtils.extractAndParseJsonBlock<BarChartData>(
                unstructuredResult.message, 
                schema
            );

            if (chartData) {
                // Prepare the artifact
                const artifact: Partial<Artifact> = {
                    type: 'chart-data',
                    content: JSON.stringify(chartData),
                    metadata: {
                        title: chartData.title,
                        chartType: 'bar',
                        projectId: params.projectId
                    }
                };

                // Save the artifact
                const savedArtifact = await this.artifactManager.saveArtifact(artifact);

                return {
                    type: StepResultType.GenerateChartResult,
                    finished: true,
                    artifactIds: [savedArtifact?.id],
                    response: {
                        type: StepResponseType.ChartResponse,
                        message: unstructuredResult.message,
                        data: chartData
                    }
                };
            } else {
                throw new Error("Could not find chart data in the response: ${unstructuredResult}");
            }
        } catch (error) {
            Logger.error('Error generating chart:', error);
            return {
                type: StepResultType.GenerateChartResult,
                finished: true,
                needsUserInput: true,
                response: {
                    type: StepResponseType.ChartResponse,
                    message: 'Failed to generate the chart. Please try again later.'
                }
            };
        }
    }
}
