import { Agent, HandlerParams } from './agents';
import Logger from 'src/helpers/logger';
import { ContentProject, ContentTask } from './contentManager';
import { ModelMessageResponse } from 'src/schemas/ModelResponse';
import { Project, Task } from 'src/tools/taskManager';

export class SimpleAgent extends Agent {
    protected projectCompleted(project: Project<Task>): void {
        throw new Error('Method not implemented.');
    }
    protected processTask(task: Task): Promise<void> {
        throw new Error('Method not implemented.');
    }
    
    public async initialize?() {}
    
    protected async handlerThread(params: HandlerParams): Promise<void> {
        try {
            const response = await this.modelHelpers.generate<ModelMessageResponse>({
                instructions: "You are a helpful agent.",
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
            const response = await this.modelHelpers.generate<ModelMessageResponse>({
                instructions: "You are a helpful agent.",
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
