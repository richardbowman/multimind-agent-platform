import { JSONSchema } from 'src/llm/ILLMService';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { PromptBuilder } from 'src/llm/promptBuilder';
import { ArtifactType } from 'src/tools/artifact';
import { ModelConversation } from '../interfaces/StepExecutor';
import { OperationTypes } from 'src/schemas/ArtifactGenerationResponse';

@StepExecutorDecorator(ExecutorType.GENERATE_SPREADSHEET, 'Create/revise CSV spreadsheets (that you can fit into context, not for large spreadsheets)')
export class GenerateSpreadsheetExecutor extends GenerateArtifactExecutor {
    protected addContentFormattingRules(prompt: ModelConversation) {
        prompt.addInstruction(`SPREADSHEET FORMATTING RULES:
- Use comma-separated values (CSV) format
- Include a header row with column names
- Ensure consistent number of columns in each row
- Every cell should be enclosed in double quotes
- To escape double quotes, use two double quotes in a row ("")`);
    }

    protected getSupportedFormats(): string[] {
        return ['csv'];
    }

    getArtifactType(codeBlockType: string): ArtifactType {
        return ArtifactType.Spreadsheet;
    }

    protected getInstructionByOperation(operation: OperationTypes): string {
        const baseInstructions = super.getInstructionByOperation(operation);
        return (operation === 'append' || operation === 'patch') ? baseInstructions + "You must use the same columns as the original document." : baseInstructions;
    }
}
