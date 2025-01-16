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
import { ChatClient } from 'src/chat/chatClient';

@StepExecutorDecorator(ExecutorType.CREATE_CHANNEL, 'Create channels with appropriate templates and settings')
export class CreateChannelExecutor implements StepExecutor {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;
    private artifactManager: ArtifactManager;
    private chatClient: ChatClient;

    constructor(params: ExecutorConstructorParams) {
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
        this.artifactManager = params.artifactManager!;
        this.chatClient = params.chatClient;
    }

    private async createChannel(params: {
        name: string;
        description: string;
        isPrivate: boolean;
        members: string[];
        goalTemplate: string;
        defaultResponderId: string;
        artifactIds?: string[];
    }): Promise<string> {
        // Always include the RouterAgent in the channel members
        params.members = [...params.members, 'router-agent'];
        
        // If a goal template is specified, create a project with its tasks
        const template = GoalTemplates.find(t => t.id === params.goalTemplate);
        let projectId: string | undefined;
        
        if (template) {
            const project = await this.taskManager.createProject({
                name: params.name,
                tasks: template.initialTasks.map((task, i) => ({
                    description: task.description,
                    type: task.type
                })),
                metadata: {
                    description: params.description || '',
                    tags: template.tags
                }
            });
            projectId = project.id;
        }

        // Create the actual channel
        const channelId = await this.chatClient.createChannel({
            ...params,
            projectId,
            members: params.members,
            defaultResponderId: params.defaultResponderId,
            artifactIds: params.artifactIds
        });

        return channelId;
    }

    async execute(params: ExecuteParams & { executionMode: 'conversation' | 'task' }): Promise<StepResult> {
        const { goal, context } = params;
        
        // Extract channel creation requirements from the goal
        const channelPurpose = goal;
        
        // Generate a channel name using the LLM
        const namePrompt = `Generate a concise, descriptive channel name for a channel with this purpose:
${channelPurpose}

The name should:
- Be 2-4 words
- Use lowercase with hyphens between words
- Be clear and specific
- Avoid special characters except hyphens

Return ONLY the channel name.`;

        const nameResponse = await this.modelHelpers.generate({
            message: namePrompt,
            instructions: ''
        });
        
        const channelName = nameResponse.message?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') || channelPurpose.toLowerCase().replace(/\s+/g, '-');
        
        const selectedTemplate = await this.findBestTemplate(channelPurpose);

        if (!selectedTemplate) {
            return {
                finished: true,
                response: {
                    message: "Could not find a suitable template for this channel purpose",
                    reasoning: "No matching template found in available templates"
                }
            };
        }

        // get artifacts created/used in this channel to attach to new channel
        const artifactIds = [
            ...new Set([
                ...context?.artifacts?.map(a => a.id) || [],
                ...params.steps.filter(s => s.props.stepType === "create_revise_plan").map(s => s.props?.result?.response?.artifactId)
            ].filter(s => s))
        ]

        // Create the channel using the selected template
        const channelId = await this.createChannel({
            name: channelName,
            description: `Channel for: ${channelPurpose}`,
            isPrivate: false,
            members: selectedTemplate.supportingAgents,
            goalTemplate: selectedTemplate.id,
            defaultResponderId: selectedTemplate.supportingAgents[0] || 'router-agent',
            artifactIds: artifactIds
        });

        // Generate a detailed explanation using the LLM
        const explanationPrompt = `You just created a new channel called "${channelName}" using the "${selectedTemplate.name}" template. 
The channel includes these supporting agents: ${selectedTemplate.supportingAgents.join(', ')}.
The channel's purpose is: ${channelPurpose}

Please write a clear, friendly message to the user explaining:
1. What the channel is for
2. Which agents are included and why
3. What initial tasks have been set up
4. How they can use the channel to achieve their goals

Write in a professional but approachable tone.`;

        const explanationResponse = await this.modelHelpers.generate({
            message: explanationPrompt,
            instructions: ''
        });

        return {
            finished: true,
            response: {
                message: explanationResponse.message || `Created new channel "${channelPurpose}"`,
                reasoning: `Selected template ${selectedTemplate.name} based on channel purpose: ${channelPurpose}`,
                data: {
                    channelId,
                    template: selectedTemplate,
                    supportingAgents: selectedTemplate.supportingAgents,
                    initialTasks: selectedTemplate.initialTasks,
                    artifactIds
                }
            }
        };
    }

    private async findBestTemplate(channelPurpose: string): Promise<GoalTemplate | undefined> {
        // Create a prompt for the LLM to select the best template
        const templateOptions = GoalTemplates.map(t => 
            `Template: ${t.name}\nDescription: ${t.description}\nID: ${t.id}`
        ).join('\n\n');

        const prompt = `You are helping select the best channel template for a new project. 
Here are the available templates:

${templateOptions}

The channel purpose is: ${channelPurpose}

Please select the most appropriate template ID from the list above. 
Return ONLY the template ID as your response.`;

        try {
            const response = await this.modelHelpers.model.sendLLMRequest({
                messages: [{ role: 'user', content: prompt }],
                parseJSON: false
            });

            const selectedId = response.response.message?.trim();
            if (!selectedId) {
                return undefined;
            }

            return GoalTemplates.find(t => t.id === selectedId);
        } catch (error) {
            console.error('Error selecting template:', error);
            return undefined;
        }
    }
}
