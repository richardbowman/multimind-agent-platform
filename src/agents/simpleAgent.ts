import { Agent, HandlerParams } from './agents';
import Logger from 'src/helpers/logger';
import { ContentProject, ContentTask } from './contentManager';
import { ModelMessageResponse } from 'src/schemas/ModelResponse';
import { Project, Task } from 'src/tools/taskManager';
import { PromptBuilder, ContentType } from 'src/llm/promptBuilder';

export class SimpleAgent extends Agent {
    protected projectCompleted(project: Project): void {
        throw new Error('Method not implemented.');
    }
    protected processTask(task: Task): Promise<void> {
        throw new Error('Method not implemented.');
    }
    
    protected async handlerThread(params: HandlerParams): Promise<void> {
        try {
            const promptBuilder = this.modelHelpers.createPrompt();

            // Get channel data including any project goals
            const channelData = await this.chatClient.getChannelData(params.userPost.channel_id);
            const project = channelData?.projectId
                ? this.projects.getProject(channelData.projectId)
                : null;
            if (project) {
                promptBuilder.addContent(ContentType.GOALS, project);
            }
            promptBuilder.addContent(ContentType.PURPOSE);
            promptBuilder.addContent(ContentType.CHANNEL, channelData);
            promptBuilder.addInstruction("You are a helpful agent.");
            const prompt = promptBuilder.build();

            const response = await this.modelHelpers.generate<ModelMessageResponse>({
                instructions: prompt,
                message: params.userPost.message,
                threadPosts: params.threadPosts
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
