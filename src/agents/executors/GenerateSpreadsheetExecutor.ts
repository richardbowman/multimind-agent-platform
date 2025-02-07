import { JSONSchema } from 'src/llm/ILLMService';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ExecutorType } from '../interfaces/ExecutorType';
import { GenerateArtifactExecutor } from './GenerateArtifactExecutor';
import { PromptBuilder } from 'src/llm/promptBuilder';

@StepExecutorDecorator(ExecutorType.GENERATE_SPREADSHEET, 'Create/revise CSV spreadsheets (that you can fit into context, not for large spreadsheets)')
export class GenerateSpreadsheetExecutor extends GenerateArtifactExecutor {
    protected addContentFormattingRules(prompt: PromptBuilder) {
        prompt.addInstruction(`SPREADSHEET FORMATTING RULES:
- Use comma-separated values (CSV) format
- Include a header row with column names
- Ensure consistent number of columns in each row
- Use proper escaping for special characters`);
    }

    protected getSupportedFormats(): string[] {
        return ['csv'];
    }
}
