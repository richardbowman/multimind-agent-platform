import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ArtifactManager } from 'src/tools/artifactManager';
import Logger from '../../helpers/logger';
import { ExecutorType } from '../interfaces/ExecutorType';
import { GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { ArtifactGenerationResponse } from 'src/schemas/ArtifactGenerationResponse';
import { StepResponseType } from '../interfaces/StepResult';

@StepExecutorDecorator(ExecutorType.GENERATE_DOCUMENT, 'Create/revise Markdown documents')
export class GenerateDocumentExecutor extends GenerateArtifactExecutor {
    protected getContentFormattingRules(): string {
        return `DOCUMENT FORMATTING RULES:
- Use standard Markdown syntax
- Include proper headings and structure
- Use lists, tables, and other formatting as needed
- Ensure proper spacing between elements`;
    }

    protected async getOutputInstructions(schema: any): Promise<string> {
        const baseInstructions = await super.getOutputInstructions(schema);
        return `${baseInstructions}

3. Provide the document content in a separately enclosed \`\`\`markdown code block`;
    }

    protected getSupportedFormats(): string[] {
        return ['markdown'];
    }
}
