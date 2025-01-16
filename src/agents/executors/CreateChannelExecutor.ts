import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResult } from '../interfaces/StepResult';
import { ExecutorType } from '../interfaces/ExecutorType';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { GoalTemplate, GoalTemplates } from '../../schemas/goalTemplateSchema';
import { TaskManager } from '../../tools/taskManager';
import { ModelHelpers } from '../../llm/modelHelpers';
import { ArtifactManager } from '../../tools/artifactManager';
import { ILLMService } from '../../llm/ILLMService';
import { IVectorDatabase } from '../../llm/IVectorDatabase';
import { Settings } from '../../tools/settings';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';

@StepExecutorDecorator(ExecutorType.CREATE_CHANNEL, 'Create channels with appropriate templates and settings')
export class CreateChannelExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;
    private artifactManager: ArtifactManager;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
        this.artifactManager = params.artifactManager!;
    }

    async execute(params: ExecuteParams & { executionMode: 'conversation' | 'task' }): Promise<StepResult> {
        const { goal, context } = params;
        
        // Extract channel creation requirements from the goal
        const channelPurpose = goal;
        const selectedTemplate = this.findBestTemplate(channelPurpose);

        if (!selectedTemplate) {
            return {
                finished: true,
                response: {
                    message: "Could not find a suitable template for this channel purpose",
                    reasoning: "No matching template found in available templates"
                }
            };
        }

        // Create channel creation task
        const channelTask = await this.taskManager.addTask({
            description: `Create channel for: ${channelPurpose}`,
            type: 'channel-creation',
            creator: params.agentId,
            props: {
                template: selectedTemplate,
                purpose: channelPurpose
            }
        });

        return {
            finished: true,
            response: {
                message: `Channel creation task created using template: ${selectedTemplate.name}`,
                reasoning: `Selected template ${selectedTemplate.name} based on channel purpose: ${channelPurpose}`,
                data: {
                    taskId: channelTask.id,
                    template: selectedTemplate
                }
            }
        };
    }

    private findBestTemplate(channelPurpose: string): GoalTemplate | undefined {
        // Simple matching based on keywords in the purpose
        const purposeLower = channelPurpose.toLowerCase();
        
        return GoalTemplates.find(template => {
            const templateNameMatch = template.name.toLowerCase().includes(purposeLower);
            const descriptionMatch = template.description.toLowerCase().includes(purposeLower);
            return templateNameMatch || descriptionMatch;
        });
    }
}
