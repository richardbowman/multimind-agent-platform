import { GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ArtifactType } from 'src/tools/artifact';
import { ModelConversation } from '../interfaces/StepExecutor';

/**
 * Executor that creates structured content outlines for documents.
 * Key capabilities:
 * - Generates hierarchical document outlines
 * - Creates logical section breakdowns
 * - Provides section descriptions and key points
 * - Incorporates research findings into outline structure
 * - Suggests content development strategies
 * - Maintains consistent document organization
 * - Supports both new outlines and revisions
 * - Integrates with content generation workflow
 */
@StepExecutorDecorator(ExecutorType.OUTLINE, 'Create structured content outlines')
export class OutlineExecutor extends GenerateArtifactExecutor {
    protected addContentFormattingRules(prompt: ModelConversation) {
        prompt.addInstruction(`OUTLINE FORMATTING RULES:
- Use Markdown headings for structure (H1 for title, H2 for sections)
- Each section should have:
  * A clear heading
  * A detailed description
  * 3-5 key points
- Include a content strategy section at the end
- Use bullet points for key points
- Maintain consistent formatting throughout`);
    }

    protected getSupportedFormat(): string {
        return 'markdown';
    }

    getArtifactType(codeBlockType: string): ArtifactType {
        return ArtifactType.Document;
    }
}
