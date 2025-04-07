import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResponseType, StepResult, StepResultType } from '../interfaces/StepResult';
import { getGeneratedSchema } from '../../helpers/schemaUtils';
import { TemplateSelectionResponse } from '../../schemas/TemplateSelectionResponse';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { ModelHelpers } from '../../llm/modelHelpers';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { ExecutorType } from '../interfaces/ExecutorType';
import { ContentType, globalRegistry, OutputType } from 'src/llm/promptBuilder';
import { StringUtils } from 'src/utils/StringUtils';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact, ArtifactType, DocumentSubtype } from 'src/tools/artifact';
import { asError } from 'src/types/types';
import { asUUID, UUID } from 'src/types/uuid';

/**
 * Executor that selects the most appropriate document template based on user goals and requirements.
 * Key capabilities:
 * - Analyzes user goals and requirements
 * - Selects the most appropriate template from available options
 * - Provides reasoning for template selection
 * - Suggests modifications if needed
 */
@StepExecutorDecorator(ExecutorType.SELECT_TEMPLATE, 'Select appropriate document template based on user goals', true)
export class TemplateSelectorExecutor extends BaseStepExecutor<StepResponse> {
    private modelHelpers: ModelHelpers;
    private artifactManager: ArtifactManager;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.artifactManager = params.artifactManager;

        globalRegistry.stepResponseRenderers.set(StepResponseType.DocumentTemplate, async (response : StepResponse) => {
            const artifactId = response.data?.selectedTemplateId;
            const artifact : Artifact = artifactId && await this.artifactManager.loadArtifact(artifactId);
            return (artifact && `DOCUMENT CREATED FROM TEMPLATE ${artifact.metadata?.title} (ID: ${artifact.id}) Description: \n${artifact.metadata?.description?.toString()}\n`) ?? "[NO LOADED TEMPLATE]";
        });
    }

    async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
        let message;
        try {
            const schema = await getGeneratedSchema(SchemaType.TemplateSelectionResponse);

            // Get available templates
            const templates = await this.artifactManager.getArtifacts({type: ArtifactType.Document, 'metadata.subtype': DocumentSubtype.Template});

            const instructions = this.startModel(params);
            instructions.addContext({contentType: ContentType.ABOUT});
            instructions.addContext({contentType: ContentType.INTENT, params});
            instructions.addContext({contentType: ContentType.OVERALL_GOAL, goal: params.overallGoal||""});
            // instructions.addContext({contentType: ContentType.CONVERSATION, posts: params.context?.threadPosts||[]});
            instructions.addInstruction( `Available Templates:
                ${templates.map(t => `
                - ${t.metadata?.title} (${t.id})
                ${t.metadata?.description}
                `).join('\n')}

                Analyze the user's goals and requirements to select the most appropriate template.
                Consider:
                - The type of document needed
                - The level of detail required
                - The user's business context
                - Any specific requirements mentioned

                Provide in the JSON block:
                - selectedTemplateId: The ID of the most appropriate template
                
                Also provide in your response message:
                - Reasoning: Explanation of why this template was chosen
                - Suggested Modifications: Any suggested changes to better fit the user's needs
                `);
            instructions.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});

            const modelResponse = await instructions.generate({
                message: params.stepGoal || params.message,
                instructions
            });
            message = StringUtils.extractNonCodeContent(modelResponse.message);
            const data = StringUtils.extractAndParseJsonBlock<TemplateSelectionResponse>(modelResponse.message, schema);

            // Create a copy of the selected template as a new artifact
            let newArtifactId: UUID | undefined;
            if (data.selectedTemplateId) {
                const template = await this.artifactManager.loadArtifact(asUUID(data.selectedTemplateId));
                if (template) {
                    const newArtifact = await this.artifactManager.saveArtifact({
                        type: template.type,
                        content: template.content,
                        metadata: {
                            ...template.metadata,
                            title: `Copy of ${template.metadata?.title || 'Template'}`,
                            isTemplateCopy: true,
                            originalTemplateId: data.selectedTemplateId,
                            subtype: template.metadata?.subtype || DocumentSubtype.General
                        }
                    });
                    newArtifactId = newArtifact.id;
                }
            }

            return {
                finished: true,
                replan: ReplanType.Allow,
                artifactIds: newArtifactId ? [newArtifactId] : undefined,
                response: {
                    type: StepResponseType.DocumentTemplate,
                    status: message,
                    data: {
                        ...data,
                        newArtifactId
                    },
                }
            };
        } catch (error) {
            return {
                type: StepResultType.Error,
                finished: true,
                replan: ReplanType.Allow,
                response: {
                    status: `[Could not select template. Error: ${asError(error).message}] ${message}`
                }
            };
        }
    }
}
