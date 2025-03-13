import { StepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResponse, StepResult } from '../interfaces/StepResult';
import { ExecutorType } from '../interfaces/ExecutorType';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { GoalTemplate } from '../../schemas/goalTemplateSchema';
import { TaskManager, TaskType } from '../../tools/taskManager';
import { ModelHelpers } from '../../llm/modelHelpers';
import { ArtifactManager } from '../../tools/artifactManager';
import { ILLMService } from '../../llm/ILLMService';
import { IVectorDatabase } from '../../llm/IVectorDatabase';
import { Settings } from '../../tools/settings';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { ChatClient } from 'src/chat/chatClient';
import { ServerRPCHandler } from 'src/server/ServerRPCHandler';
import { createChannelHandle, CreateChannelHandlerParams } from 'src/shared/channelTypes';
import { UUID } from 'src/types/uuid';
import { Channel } from 'diagnostics_channel';

interface ChannelStepResponse extends StepResponse {
    data?: {
        channelId: UUID;
        channelName: string;
        channelDescription: string;
    }
}

@StepExecutorDecorator(ExecutorType.CREATE_CHANNEL, 'Create channels with appropriate templates and settings')
export class CreateChannelExecutor implements StepExecutor<ChannelStepResponse> {
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

    private async createChannel(params: CreateChannelHandlerParams): Promise<UUID> {
        const mappedParams = await ServerRPCHandler.createChannelHelper(this.chatClient, this.taskManager, params);
        return await this.chatClient.createChannel(mappedParams);
    }

    async execute(params: ExecuteParams): Promise<StepResult<ChannelStepResponse>> {
        const { goal, context } = params;
        
        const channelPurpose = goal;
        const templates = await ServerRPCHandler.loadGoalTemplates();
        
        // Single LLM call to get all needed information
        const prompt = `You are creating a new channel with this purpose: ${channelPurpose}

Available templates:
${templates.map(t => 
    `Template: ${t.name} (ID: ${t.id})
    Description: ${t.description}
    Supporting Agents: ${t.supportingAgents.join(', ')}
    Initial Tasks: ${t.initialTasks.map(t => t.description).join(', ')}`
).join('\n\n')}

Please provide:
1. A channel name (start with #, 2-4 words, lowercase with hyphens)
2. A channel description
3. The most appropriate template ID
4. A clear explanation of:
   - What the channel is for
   - Why this template was chosen
   - Which agents are included and why
   - What initial tasks have been set up
   - How to use the channel effectively

Return your response as a JSON object matching this schema:
{
    "name": string,
    "description": string,
    "templateId": string,
    "explanation": string,
    "initialTasks": string[],
    "supportingAgents": string[]
}`;

        const response = await this.modelHelpers.generate({
            message: prompt,
            instructions: '',
            parseJSON: true
        });

        const channelData = response.message as CreateChannelResponse;
        
        // Ensure channel name starts with #
        const channelName = createChannelHandle(channelData.name);

        // Get artifacts created/used in this channel to attach to new channel
        const artifactIds = [
            ...new Set([
                ...context?.artifacts?.map(a => a.id) || [],
                ...params.steps.filter(s => s.props.stepType === "create_revise_plan").map(s => s.props?.result?.response?.artifactId)
            ].filter(s => s))
        ];

        // Create the channel using the selected template
        const channelId = await this.createChannel({
            name: channelName,
            description: channelData.description,
            isPrivate: false,
            members: channelData.supportingAgents,
            goalTemplate: channelData.templateId,
            goalDescriptions: channelData.initialTasks,
            defaultResponder: templates.find(t => t.id === channelData.templateId)?.defaultResponder,
            artifactIds: artifactIds
        });

        return {
            finished: true,
            response: {
                message: channelData.explanation || `Created new channel "${channelPurpose}"`,
                reasoning: `Selected template ${channelData.templateId} based on channel purpose: ${channelPurpose}`,
                data: {
                    channelId,
                    templateId: channelData.templateId,
                    initialTasks: channelData.initialTasks,
                    artifactIds
                }
            }
        };
    }
}
