import { PromptBuilder } from 'src/llm/promptBuilder';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ArtifactGenerationStepResponse, GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { ArtifactType } from 'src/tools/artifact';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ModelConversation } from '../interfaces/StepExecutor';
import { JSONSchema } from 'openai/lib/jsonschema';

@StepExecutorDecorator(ExecutorType.GENERATE_MARKWHEN, 'Create/revise a Markwhen timeline roadmap.')
export class GenerateMarkwhenExecutor extends GenerateArtifactExecutor {
    /**
     * Gets the JSON Schema for Gantt chart data
     * @returns JSONSchema for GanttData structure
     */
    protected async getGanttSchema(): Promise<JSONSchema> {
        return getGeneratedSchema('GanttData');
    }

    protected addContentFormattingRules(prompt: ModelConversation<ArtifactGenerationStepResponse>) {
        const schema = this.getGanttSchema();
        prompt.addInstruction(`GANTT CHART DATA FORMAT RULES:
- Generate JSON data for a Gantt chart inside <artifact_gantt> blocks
- Follow this JSON Schema for proper structure:
${JSON.stringify(schema, null, 2)}
- Use ISO 8601 date format for all date fields
- Ensure all IDs are unique numbers
- Maintain proper task hierarchy using parent IDs
- Include dependencies with links where needed`);
    }

    protected getContentRules(): string {
        return `GANTT CHART DATA FORMATTING RULES:
- Use valid JSON format INSIDE of the <artifact_gantt> blocks
- Follow the provided JSON Schema exactly
- Include all required fields for tasks and links
- Use proper ISO 8601 date formatting
- Maintain task hierarchy with parent/child relationships
- Include dependencies with links where needed`;
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
