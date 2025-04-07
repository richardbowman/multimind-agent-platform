import { BaseStepExecutor } from '../interfaces/BaseStepExecutor';
import { ExecuteParams } from '../interfaces/ExecuteParams';
import { ReplanType, StepResponse, StepResponseType, StepResult } from '../interfaces/StepResult';
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
import { withRetry } from 'src/helpers/retry';

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
        const templatePrompt = `# Recommended Channel Templates:
${templates.map(t => 
    `Template: ${t.name} (ID: ${t.id})
    Description: ${t.description}
    Supporting Agents: ${t.supportingAgents.join(', ')}
    Initial Tasks: ${t.initialTasks.map(t => t.description).join(', ')}`
).join('\n\n')}`;

        // Single LLM call to get all needed information
        const schema = await getGeneratedSchema(SchemaType.CreateChannelResponse);
        const prompt = this.startModel(params);
        prompt.addInstruction(`You are a function that creates a chat channel for the user and appropriate agents.`)
        .addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses||[]})
        .addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts||[]});

        prompt.addInstruction(`# CURRENT CHANNELS: (You may not duplicate or change an existing channel)
${(await this.chatClient.getChannels()).map(c => ` - ${c.name}: ${c.description}`).join('\n')}\n`);

        prompt.addContext({contentType: ContentType.GOALS_FULL, params})
        .addContext(templatePrompt)
        .addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema, specialInstructions: `Step 1. In the \`\`\`json code block, use the attributes specified in the schema to provide information for the system to create the desired channel. Your channel name must be in the format "#channel-name".
            2. Then, respond to the agent explaining that you've created the channel, which agents are a part of the channel, and how you recommend the channel be used.`});
          
        const {rawResponse, channelData, status} = await withRetry(async () => {
            const rawResponse = await prompt.generate({
                message: params.stepGoal||params.message
            });
            const channelData = StringUtils.extractAndParseJsonBlock<CreateChannelResponse>(rawResponse.message, schema);
            const status = StringUtils.extractNonCodeContent(rawResponse.message, [], ["json"]);
            return {rawResponse, channelData, status};
        });
        
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
            goalDescriptions: channelData.initialTasks,
            defaultResponder: templates.find(t => t.id === channelData.templateId)?.defaultResponder,
            artifactIds: artifactIds
        });

        await this.chatClient.createChannel(channel);

        return {
            finished: true,
            replan: ReplanType.Allow,
            response: {
                type: StepResponseType.Channel,
                status: `CHANNEL CREATED: ${status}`,
                data: {
                    channelHandle: channelName,
                    channelDescription: channel.description,
                    templateId: channel.goalTemplate
                }
            }
        };
    }
}
