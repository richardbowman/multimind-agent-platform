import { JSONSchema } from 'src/llm/ILLMService';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { PromptBuilder } from 'src/llm/promptBuilder';
import { ArtifactType } from 'src/tools/artifact';
import { ModelConversation } from '../interfaces/StepExecutor';
import { OperationTypes } from 'src/schemas/ArtifactGenerationResponse';
import { RetryError } from 'src/helpers/retry';

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

    protected getSupportedFormat(): string {
        return 'csv';
    }

    getArtifactType(codeBlockType: string): ArtifactType {
        return ArtifactType.Spreadsheet;
    }

    protected getInstructionByOperation(operation: OperationTypes): string {
        const baseInstructions = super.getInstructionByOperation(operation);
        if (operation === 'append' || operation === 'patch') {
            return baseInstructions + `You must:
- Use the same columns as the original document
- Include the header row in your response for validation
- The actual data rows will be appended without duplicating headers`;
        }
        return baseInstructions;
    }

    protected async prepareArtifactMetadata(result: any): Promise<Record<string, any>> {
        const metadata = await super.prepareArtifactMetadata(result);
        if (result.operation === 'append' && result.content) {
            // Store the expected headers for validation
            const lines = result.content.split('\n');
            if (lines.length > 0) {
                metadata.expectedHeaders = lines[0];
            }
        }
        return metadata;
    }

    protected async validateAndPrepareAppendContent(newContent: string, existingContent: string): Promise<string> {
        const newLines = newContent.split('\n');
        const existingLines = existingContent.split('\n');
        
        if (newLines.length < 1 || existingLines.length < 1) {
            return newContent;
        }

        const newHeaders = newLines[0];
        const existingHeaders = existingLines[0];

        // Validate headers match
        if (newHeaders !== existingHeaders) {
            throw new RetryError(`Header mismatch. Expected: ${existingHeaders}, Received: ${newHeaders}`);
        }

        // Return only data rows from new content
        return existingContent + "\n" + newLines.slice(1).join('\n');
    }
}
