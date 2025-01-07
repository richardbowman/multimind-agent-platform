import { randomUUID } from 'crypto';
import { Agent, HandlerParams } from './agents';
import { ModelMessageHistory } from 'src/llm/lmstudioService';
import { CONTENT_CREATION_CHANNEL_ID } from 'src/helpers/config';
import Logger from 'src/helpers/logger';
import { ContentProject, ContentTask } from './contentManager';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';

export class ContentWriter extends Agent<ContentProject, ContentTask> {
    protected handlerThread(params: HandlerParams): Promise<void> {
        throw new Error('Method not implemented.');
    }
    protected async handleChannel(params: HandlerParams): Promise<void> {
        if (params.userPost.channel_id !== CONTENT_CREATION_CHANNEL_ID) {
            return;
        }

        const projectId = params.userPost.props["project-id"];
        if (!projectId) {
            Logger.warn("No project ID provided in content creation message");
            return;
        }

        try {
            let project = await this.projects.getProject(projectId);
            if (!project) {
                // Create new project if it doesn't exist
                const newProject: ContentProject = {
                    id: projectId,
                    goal: "Content Creation",
                    description: "Automatically created content project",
                    metadata: {
                        createdAt: new Date(),
                        updatedAt: new Date(),
                        status: 'active',
                        owner: params.userPost.user_id,
                        sourceMessage: {
                            channelId: params.userPost.channel_id,
                            messageId: params.userPost.id
                        }
                    }
                };
                await this.projects.createProject(newProject);
                project = newProject;
                Logger.info(`Created new project ${projectId}`);
            }

            // Create a new content task from the message
            const task: ContentTask = {
                id: randomUUID(),
                projectId: projectId,
                title: "Content Section",
                description: params.userPost.message,
                type: "content",
                creator: params.userPost.user_id,
                complete: false,
                inProgress: false
            };

            await this.projects.addTask(task);
            await this.processTask(task);
        } catch (error) {
            Logger.error("Error handling content creation message", error);
        }
    }

    async processTask(task: ContentTask) {
        try {
            const searchResults = await this.chromaDBService.query([task.description], undefined, 10);
            const history : ModelMessageHistory[] = [
                {
                    "role": "system",
                    "content": `Search results from knowledge base:\n
                    ${searchResults.map(s => `Result ID: ${s.id}\nResult Title:${s.metadata.title}\nResult Content:\n${s.text}\n\n`)}`
                }
            ];

            //todo: need to make this be able to pull in search queries
            const sectionContent = await this.llmService.sendMessageToLLM(`Write a section on ${task.title}: ${task.description}`, history);
    
            task.content = sectionContent;
            task.props = {
                ...task.props,
                contentBlockId: randomUUID()
            };
        } catch (error) {
            //todo: remove failed tasks or mark completed, causes infinite loop right now
            Logger.error(`Error processing task "${task.title} ${task.description}"`, error);
        } finally {
            //todo: remove failed tasks or mark completed, causes infinite loop right now
            await this.projects.completeTask(task.id);
        }
    }

    protected async projectCompleted(project: ContentProject): Promise<void> {
        // Check if this was a project created from a message
        const sourceMessage = project.metadata?.sourceMessage;
        if (!sourceMessage) {
            return;
        }

        // Get all completed tasks for this project
        const tasks = await this.projects.getTasks(project.id);
        const completedTasks = tasks.filter(task => task.complete);

        // Compile content from all tasks
        const content = completedTasks
            .map(task => (task as ContentTask).content)
            .filter(Boolean)
            .join('\n\n');

        // Reply to the original message
        await this.chat.createPost({
            channel_id: sourceMessage.channelId,
            message: `Content generation completed!\n\n${content}`,
            root_id: sourceMessage.messageId
        });
    }


}
