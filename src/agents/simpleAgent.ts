import { Agent, HandlerParams } from './agents';
import Logger from 'src/helpers/logger';
import { ContentProject, ContentTask } from './contentManager';
import { ModelMessageResponse } from 'src/schemas/ModelResponse';
import { Project, Task } from 'src/tools/taskManager';
import { PromptBuilder, ContentType } from 'src/llm/promptBuilder';
import { ModelType } from "src/llm/types/ModelType";
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { LLMContext } from 'src/llm/ILLMService';

export class SimpleAgent extends Agent {
    protected async projectCompleted(project: Project): Promise<void> {
        throw new Error('Method not implemented.');
    }
    protected processTask(task: Task): Promise<void> {
        throw new Error('Method not implemented.');
    }
    
    constructor(params: AgentConstructorParams) {
        super(params);
        this.modelHelpers.setPurpose("You can only respond to messages using your general knowledge and do not have acccess to other Multimind tools (only other agents can do things like web research, task management, etc.). For users wanting to access additional tools, you should point them to the #onboarding channel.");
    }

    protected async handlerThread(params: HandlerParams): Promise<void> {
        try {
            const instructions = this.modelHelpers.createPrompt();

            // Get channel data including any project goals
            const channel = await this.chatClient.getChannelData(params.userPost.channel_id);
            const channelProject = channel?.projectId && await this.projects.getProject(channel.projectId);

            instructions.addContext({contentType: ContentType.PURPOSE});
            channel && instructions.addContext({contentType: ContentType.CHANNEL_DETAILS, channel, tasks: Object.values(channelProject?.tasks||{})});

            const isVerbal = params.userPost?.props?.["verbalConversation"] === true || params.rootPost?.props?.["verbalConversation"] === true;
            
            if (isVerbal) {
                instructions.addInstruction("You are a voice assistant. Respond concisely in SSML format only.");
            } else {
                instructions.addInstruction("You are a helpful agent. You may respond using SSML if you need to introduce pauses.");
            }

            const response = await this.modelHelpers.generateMessage({
                instructions,
                message: params.userPost.message,
                threadPosts: params.threadPosts,
                modelType: ModelType.CONVERSATION,
                context: {
                    stepType: "handleMessage"
                }
            });
            await this.reply(
                params.userPost,
                response
            );
        } catch (error) {
            Logger.error("Error handling content creation message", error);
        }
    }

    protected async handleChannel(params: HandlerParams): Promise<void> {
        this.handlerThread(params);
    }

    protected buildLLMContext(): LLMContext {
        return {
            ...super.buildLLMContext(),
            agentName: "SimpleAgent"
        }
    }
}
