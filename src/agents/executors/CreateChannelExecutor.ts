import { BaseStepExecutor } from '../interfaces/StepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { StepResponse, StepResponseType, StepResult } from '../interfaces/StepResult';
import { ExecutorType } from '../interfaces/ExecutorType';
import { StepExecutorDecorator } from '../decorators/executorDecorator';
import { TaskManager } from '../../tools/taskManager';
import { ModelHelpers } from '../../llm/modelHelpers';
import { ArtifactManager } from '../../tools/artifactManager';
import { ExecutorConstructorParams } from '../interfaces/ExecutorConstructorParams';
import { ChatClient } from 'src/chat/chatClient';
import { ServerRPCHandler } from 'src/server/ServerRPCHandler';
import { ChannelHandle, createChannelHandle } from 'src/shared/channelTypes';
import { ContentType, OutputType } from 'src/llm/promptBuilder';
import { StringUtils } from 'src/utils/StringUtils';
import { getGeneratedSchema } from 'src/helpers/schemaUtils';
import { SchemaType } from 'src/schemas/SchemaTypes';
import { CreateChannelResponse } from 'src/schemas/CreateChannnelResponse';
import { createChatHandle } from 'src/types/chatHandle';

interface ChannelStepResponse extends StepResponse {
    type: StepResponseType.Channel,
    data?: {
        channelHandle: ChannelHandle,
        templateId?: ChannelHandle,
        channelDescription?: string
    }
}

@StepExecutorDecorator(ExecutorType.CREATE_CHANNEL, 'Create channels with appropriate templates and settings')
export class CreateChannelExecutor extends BaseStepExecutor<ChannelStepResponse> {
    private modelHelpers: ModelHelpers;
    private taskManager: TaskManager;
    private artifactManager: ArtifactManager;
    private chatClient: ChatClient;

    constructor(params: ExecutorConstructorParams) {
        super(params);
        this.modelHelpers = params.modelHelpers;
        this.taskManager = params.taskManager!;
        this.artifactManager = params.artifactManager!;
        this.chatClient = params.chatClient;
    }

    async execute(params: ExecuteParams): Promise<StepResult<ChannelStepResponse>> {
        const { goal, context } = params;
        
        const channelPurpose = goal;
        const templates = await ServerRPCHandler.loadGoalTemplates();
        const templatePrompt = `Available templates:
${templates.map(t => 
    `Template: ${t.name} (ID: ${t.id})
    Description: ${t.description}
    Supporting Agents: ${t.supportingAgents.join(', ')}
    Initial Tasks: ${t.initialTasks.map(t => t.description).join(', ')}`
).join('\n\n')}`;

        // Single LLM call to get all needed information
        const schema = await getGeneratedSchema(SchemaType.CreateChannelResponse);
        const prompt = this.startModel(params);
        prompt.addInstruction('You are a chat channel creating step')
            .addContext({contentType: ContentType.GOALS_FULL, params})
            .addContext(templatePrompt)
            .addInstruction(`Please provide:
1. A channel name (start with #, 2-4 words, lowercase with hyphens)
2. A channel description
3. The most appropriate template ID
4. A clear explanation of:
   - What the channel is for
   - Why this template was chosen
   - Which agents are included and why
   - What initial tasks have been set up
   - How to use the channel effectively`)
            .addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});
          
        const rawResponse = await prompt.generate({
            message: params.stepGoal||params.message
        });
        const channelData = StringUtils.extractAndParseJsonBlock<CreateChannelResponse>(rawResponse.message, schema);
        const message = StringUtils.extractNonCodeContent(rawResponse.message, [], ["json"]);
        
        // Ensure channel name starts with #
        const channelName = createChannelHandle(channelData.name);

        // Get artifacts created/used in this channel to attach to new channel
        const artifactIds = [
            ...new Set([
                ...context?.artifacts?.map(a => a.id) || [],
                ...params.steps.map(s => s.props?.result?.response?.data?.artifactIds||[])
            ].filter(s => s))
        ];

        // Create the channel using the selected template
        const channel = await ServerRPCHandler.createChannelHelper(this.chatClient, this.taskManager, {
            name: channelName,
            description: channelData.description,
            isPrivate: false,
            members: channelData.supportingAgents.map(a => createChatHandle(a)),
            goalTemplate: createChannelHandle(channelData.templateId),
            goalDescriptions: channelData.initialTasks,
            defaultResponder: templates.find(t => t.id === channelData.templateId)?.defaultResponder,
            artifactIds: artifactIds
        });

        return {
            finished: true,
            response: {
                type: StepResponseType.Channel,
                message,
                reasoning: `Selected template ${channelData.templateId} based on channel purpose: ${channelPurpose}`,
                data: {
                    channelHandle: channelName,
                    channelDescription: channel.description,
                    templateId: channel.goalTemplate
                }
            }
        };
    }
}
