import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResponseRetention, StepResponseType, StepResult } from '../interfaces/StepResult';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/modelHelpers';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ArtifactItem, ArtifactType, DocumentSubtype } from 'src/tools/artifact';
import { ArtifactManager } from 'src/tools/artifactManager';

interface TemplateListStepResponse extends StepResponse {
    type: StepResponseType.ChannelTemplates,
    data?: {
        templates?: ArtifactItem[]
    }
}

/**
 * Executor that lists available document templates with their descriptions.
 * Key capabilities:
 * - Retrieves all available templates
 * - Formats them in a clear, readable way
 * - Returns template information without selection logic
 */
@StepExecutorDecorator(ExecutorType.LIST_TEMPLATES, 'List available document templates', true)
export class ListTemplatesExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.artifactManager = params.artifactManager;
    }

    async execute(params: ExecuteParams): Promise<StepResult<TemplateListStepResponse>> {
        // Get available templates
        const templates = await this.artifactManager.getArtifacts({type: ArtifactType.Document, 'metadata.subtype': DocumentSubtype.Template});

        // Format template information
        const templateList = templates.map(t => `
            - ${t.metadata?.title} (${t.id})
              ${t.metadata?.description}`).join('\n');

        return {
            replan: ReplanType.Allow,
            finished: true,
            response: {
                type: StepResponseType.ChannelTemplates,
                status: `Available Templates:\n${templateList}`,
                retention: StepResponseRetention.Long,
                data: {
                    templates
                }
            }
        };
    }
}
