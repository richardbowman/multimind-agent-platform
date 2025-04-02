import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ArtifactGenerationStepResponse, GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { ArtifactType } from 'src/tools/artifact';
import { ModelConversation } from '../interfaces/StepExecutor';
import { JSONSchema } from 'openai/lib/jsonschema';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';

@StepExecutorDecorator(ExecutorType.GENERATE_ROADMAP, 'Create/revise a Gantt timeline roadmap.')
export class GenerateRoadmapExecutor extends GenerateArtifactExecutor {
    /**
     * Gets the JSON Schema for Gantt chart data
     * @returns JSONSchema for GanttData structure
     */
    protected async getGanttSchema(): Promise<JSONSchema> {
        return getGeneratedSchema(SchemaType.GanttData);
    }

    protected addContentFormattingRules(prompt: ModelConversation<ArtifactGenerationStepResponse>) {
        prompt.addInstruction(`GANTT CHART DATA FORMAT RULES:
- Generate JSON data for a Gantt chart inside <artifact_gantt> blocks
- Tasks must include: id, text, start date, end date
- Optional fields: progress (0-100), type ('task' or 'summary')
- Links should specify dependencies between tasks
- Use ISO 8601 date format for all date fields
- Ensure all IDs are unique numbers
- Maintain proper task hierarchy using parent IDs`);
    }

    protected async getContentRules(): Promise<string> {
        return `GANTT CHART DATA FORMATTING RULES:
- Use valid JSON format INSIDE of the <artifact_gantt> blocks that follows this JSON Schema:

\'\'\'json
${JSON.stringify(await this.getGanttSchema(), null, 2)}
\'\'\'

- Include all required fields for tasks
- Use proper ISO 8601 date formatting
- Maintain task hierarchy with parent/child relationships
- Specify dependencies in links array`;
    }

    protected getSupportedFormat(): string {
        return 'gantt';
    }

    getArtifactType(): ArtifactType {
        return ArtifactType.Document;
    }

    protected async prepareArtifactMetadata(result: any): Promise<Record<string, any>> {
        return {
            ...await super.prepareArtifactMetadata(result),
            subtype: 'Roadmap',
            format: 'gantt'
        };
    }
}
