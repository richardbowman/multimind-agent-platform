import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
 import { StepExecutor } from '../interfaces/StepExecutor';
 import { ExecuteParams } from '../interfaces/ExecuteParams';
 import { StepResult, StepResultType } from '../interfaces/StepResult';
 import { StructuredOutputPrompt } from "src/llm/ILLMService";
 import { getGeneratedSchema } from '../../helpers/schemaUtils';
 import { TemplateSelectionResponse } from '../../schemas/TemplateSelectionResponse';
 import { StepExecutorDecorator } from '../decorators/executorDecorator';
 import { ModelHelpers } from '../../llm/modelHelpers';
 import { SchemaType } from 'src/schemas/SchemaTypes';
 import { ExecutorType } from '../interfaces/ExecutorType';
 import { OnboardingConsultant } from '../onboardingConsultant';

 /**
  * Executor that selects the most appropriate document template based on user goals and requirements.
  * Key capabilities:
  * - Analyzes user goals and requirements
  * - Selects the most appropriate template from available options
  * - Provides reasoning for template selection
  * - Suggests modifications if needed
  */
 @StepExecutorDecorator(ExecutorType.SELECT_TEMPLATE, 'Select appropriate document template based on user goals', true)
 export class TemplateSelectorExecutor implements StepExecutor {
     private modelHelpers: ModelHelpers;
     private onboardingConsultant: OnboardingConsultant;

     constructor(params: ExecutorConstructorParams, onboardingConsultant: OnboardingConsultant) {
         this.modelHelpers = params.modelHelpers;
         this.onboardingConsultant = onboardingConsultant;
     }

     async execute(params: ExecuteParams): Promise<StepResult> {
         const schema = await getGeneratedSchema(SchemaType.TemplateSelectionResponse);

         // Get available templates
         const templates = this.onboardingConsultant.getAvailableTemplates();

         const modelResponse = await this.modelHelpers.generate<TemplateSelectionResponse>({
             message: params.message || params.stepGoal,
             instructions: new StructuredOutputPrompt(schema,
                 `OVERALL GOAL: ${params.overallGoal}

                 Available Templates:
                 ${templates.map(t => `
                 - ${t.name} (${t.id})
                   ${t.description}
                 `).join('\n')}

                 Analyze the user's goals and requirements to select the most appropriate template.
                 Consider:
                 - The type of document needed
                 - The level of detail required
                 - The user's business context
                 - Any specific requirements mentioned

                 Provide:
                 1. selectedTemplateId: The ID of the most appropriate template
                 2. reasoning: Explanation of why this template was chosen
                 3. suggestedModifications: Any suggested changes to better fit the user's needs
                 `)
         });

         return {
             type: 'template_selection',
             finished: true,
             response: {
                 message: `Selected template: ${modelResponse.selectedTemplateId}`,
                 reasoning: modelResponse.reasoning,
                 templateId: modelResponse.selectedTemplateId,
                 suggestedModifications: modelResponse.suggestedModifications
             }
         };
     }
 }