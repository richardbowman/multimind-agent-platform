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
    
    public async initialize?() {}
    
    protected async handlerThread(params: HandlerParams): Promise<void> {
        try {
            const promptBuilder = new PromptBuilder(this.modelHelpers.getPromptRegistry());
            promptBuilder.addInstruction("You are a helpful agent.");
            promptBuilder.addContext(params.userPost.message);
            if (params.threadPosts) {
                promptBuilder.addContext(params.threadPosts.map(post => post.message).join('\n'));
            }
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
        try {
            const promptBuilder = new PromptBuilder(this.modelHelpers.getPromptRegistry());
            promptBuilder.addInstruction("You are a helpful agent.");
            promptBuilder.addContext(params.userPost.message);
            const prompt = promptBuilder.build();

            const response = await this.modelHelpers.generate<ModelMessageResponse>({
                instructions: prompt,
                message: params.userPost.message
            })
            await this.reply(
                params.userPost,
                response
            );
        } catch (error) {
            Logger.error("Error handling content creation message", error);
        }
    }
}
