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

@StepExecutorDecorator(ExecutorType.GENERATE_SPREADSHEET, 'Create/revise CSV spreadsheets')
export class GenerateSpreadsheetExecutor extends GenerateArtifactExecutor {
    protected getContentFormattingRules(): string {
        return `SPREADSHEET FORMATTING RULES:
- Use comma-separated values (CSV) format
- Include a header row with column names
- Ensure consistent number of columns in each row
- Use proper escaping for special characters`;
    }

    protected async getOutputInstructions(schema: any): Promise<string> {
        const baseInstructions = await super.getOutputInstructions(schema);
        return `${baseInstructions}

3. Provide the spreadsheet data in a separately enclosed \`\`\`csv code block`;
    }

    protected getSupportedFormats(): string[] {
        return ['csv'];
    }
}
