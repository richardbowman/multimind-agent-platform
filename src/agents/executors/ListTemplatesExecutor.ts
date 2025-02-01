import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult, StepResultType } from '../interfaces/StepResult';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/modelHelpers';
import { ExecutorType } from '../interfaces/ExecutorType';
import { OnboardingConsultant } from '../onboardingConsultant';
import { ContentType } from 'src/llm/promptBuilder';

/**
 * Executor that lists available document templates with their descriptions.
 * Key capabilities:
 * - Retrieves all available templates
 * - Formats them in a clear, readable way
 * - Returns template information without selection logic
 */
@StepExecutorDecorator(ExecutorType.LIST_TEMPLATES, 'List available document templates', true)
export class ListTemplatesExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private onboardingConsultant: OnboardingConsultant;

    constructor(params: ExecutorConstructorParams, onboardingConsultant: OnboardingConsultant) {
        this.modelHelpers = params.modelHelpers;
        this.onboardingConsultant = onboardingConsultant;
    }

    async execute(params: ExecuteParams): Promise<StepResult> {
        // Get available templates
        const templates = this.onboardingConsultant.getAvailableTemplates();

        const prompt = this.modelHelpers.createPrompt();
        prompt.addContext({contentType: ContentType.ABOUT});
        prompt.addContext({contentType: ContentType.INTENT, params});
        prompt.addInstruction(`List all available templates with their descriptions:`);

        // Format template information
        const templateList = templates.map(t => `
            - ${t.name} (${t.id})
              ${t.description}
              Sections: ${t.sections.join(', ')}
              Required: ${t.requiredSections.join(', ')}
        `).join('\n');

        return {
            type: 'template_list',
            finished: true,
            response: {
                templates: templateList,
                count: templates.length
            }
        };
    }
}
