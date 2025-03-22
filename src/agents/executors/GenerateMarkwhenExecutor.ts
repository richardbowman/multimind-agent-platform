import { PromptBuilder } from 'src/llm/promptBuilder';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ArtifactGenerationStepResponse, GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { ArtifactType } from 'src/tools/artifact';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ModelConversation } from '../interfaces/StepExecutor';

@StepExecutorDecorator(ExecutorType.GENERATE_MARKWHEN, 'Create/revise a Markwhen timeline roadmap.')
export class GenerateMarkwhenExecutor extends GenerateArtifactExecutor {
    protected addContentFormattingRules(prompt: ModelConversation<ArtifactGenerationStepResponse>) {
        prompt.addInstruction(`GANTT CHART DATA FORMAT RULES:
- Generate JSON data for a Gantt chart inside <artifact_gantt> blocks
- Include tasks with: id, text, start date, end date, duration, progress, type (task/summary), and parent
- Include links with: id, source task id, target task id, and type (e2e)
- Use proper date formatting: new Date(year, monthIndex, day)
- For summary tasks, include child tasks with matching parent IDs
- Ensure all IDs are unique numbers`);
    }

    protected getContentRules(): string {
        return `GANTT CHART DATA FORMATTING RULES:
- Use valid JSON format INSIDE of the <artifact_gantt> blocks
- Include all required task fields
- Use proper date objects
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
