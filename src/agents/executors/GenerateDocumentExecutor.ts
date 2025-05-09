import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ArtifactGenerationStepResponse, GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { ArtifactType } from 'src/tools/artifact';
import { ModelConversation } from '../interfaces/StepExecutor';

@StepExecutorDecorator(ExecutorType.GENERATE_DOCUMENT, 'Create/revise a single Markdown document.')
export class GenerateDocumentExecutor extends GenerateArtifactExecutor {
    protected addContentFormattingRules(prompt: ModelConversation<ArtifactGenerationStepResponse>) {
        // prompt.addInstruction();
    }

    protected getContentRules(): string {
        return super.getContentRules() + `\n\nDOCUMENT FORMATTING RULES:
- Use standard Markdown syntax INSIDE of the <artifact_markdown> blocks that demarcate the document contents.
- Include proper headings and structure
- Use lists, tables, and other formatting as needed
- Ensure proper spacing between elements
- Code blocks should be properly fenced on both ends
`;
    }

    protected getSupportedFormat(): string {
        return 'markdown';
    }

    getArtifactType(codeBlockType: string): ArtifactType {
        return ArtifactType.Document;
    }
}
