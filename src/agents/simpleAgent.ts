import { Agent, HandlerParams } from './agents';
import Logger from 'src/helpers/logger';
import { ContentProject, ContentTask } from './contentManager';
import { ModelMessageResponse } from 'src/schemas/ModelResponse';
import { Project, Task } from 'src/tools/taskManager';
import { PromptBuilder, ContentType } from 'src/llm/promptBuilder';
import { ModelType } from 'src/llm/LLMServiceFactory';

export class SimpleAgent extends Agent {
    protected projectCompleted(project: Project): void {
        throw new Error('Method not implemented.');
    }
    protected processTask(task: Task): Promise<void> {
        throw new Error('Method not implemented.');
    }
    
    protected async handlerThread(params: HandlerParams): Promise<void> {
        try {
            const instructions = this.modelHelpers.createPrompt();

            // Get channel data including any project goals
            const channel = await this.chatClient.getChannelData(params.userPost.channel_id);
            const channelProject = channel?.projectId && this.projects.getProject(channel.projectId);

            instructions.addContext({contentType: ContentType.PURPOSE});
            channel && instructions.addContext({contentType: ContentType.CHANNEL_DETAILS, channel, tasks: Object.values(channelProject?.tasks||{})});

            instructions.addInstruction("You are a helpful agent. You may respond using SSML if you need to introduce pauses.");

            const response = await this.modelHelpers.generate<ModelMessageResponse>({
                instructions,
                message: params.userPost.message,
                threadPosts: params.threadPosts,
                model: ModelType.CONVERSATION,
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
}
