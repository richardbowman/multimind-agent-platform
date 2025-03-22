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
        prompt.addInstruction(`MARKWHEN SYNTAX RULES:
- Use proper Markwhen syntax inside <artifact_markwhen> blocks
- Define timelines with: timeline /timeline
- Use date ranges like: 2025-03-22 to 2025-03-25
- Add events with: [date]: Event description
- Use tags with #tag
- Add sections with: section /section
- Use proper indentation for nested events
- Include metadata with: @key: value`);
    }

    protected getContentRules(): string {
        return `MARKWHEN FORMATTING RULES:
- Use standard Markwhen syntax INSIDE of the <artifact_markwhen> blocks
- Include proper timeline definitions
- Use date ranges and events correctly
- Add appropriate tags and metadata
- Ensure proper indentation for nested structures
- Include section breaks where needed`;
    }

    protected getSupportedFormat(): string {
        return 'markwhen';
    }

    getArtifactType(): ArtifactType {
        return ArtifactType.Document;
    }

    protected async prepareArtifactMetadata(result: any): Promise<Record<string, any>> {
        return {
            ...await super.prepareArtifactMetadata(result),
            subtype: 'Roadmap',
            format: 'markwhen'
        };
    }
}
