import { randomUUID } from 'crypto';
import { Agent, HandlerParams } from './agents';
import { ModelMessageHistory } from 'src/llm/lmstudioService';
import Logger from 'src/helpers/logger';
import { ContentProject, ContentTask } from './contentManager';
import { ModelRole } from 'src/llm/ILLMService';
import { CreateProjectParams, TaskType } from 'src/tools/taskManager';
import { TaskCategories } from './interfaces/taskCategories';

export class ContentWriter extends Agent {
    async initialize?(): Promise<void> { }
    
    protected handlerThread(params: HandlerParams): Promise<void> {
        throw new Error('Method not implemented.');
    }
    protected async handleChannel(params: HandlerParams): Promise<void> {
        let projectId = params.userPost.props["project-id"];
        if (!projectId) {
            Logger.warn("No project ID provided in content creation message");
        }

        try {
            let project = projectId ? await this.projects.getProject(projectId) : undefined;
            if (!project) {
                // Create new project if it doesn't exist
                const newProject : CreateProjectParams = {
                    name: "Solve the user's writing request",
                    metadata: {
                        owner: this.userId,
                        originalPostId: params.userPost.id
                    }
                };
                
                project = await this.projects.createProject(newProject);
                Logger.info(`Created new project ${project.id}`);
            }

            // Create a new content task from the message
            const task = await this.projects.addTask(project, {
                description: "Content Section: " + params.userPost.message,
                type: TaskType.Standard,
                category: TaskCategories.Writing,
                creator: this.userId,
            });
            await this.processTask(task);
        } catch (error) {
            Logger.error("Error handling content creation message", error);
        }
    }

    async processTask(task: ContentTask) {
        try {
            const searchResults = await this.vectorDBService.query([task.description], undefined, 10);
            const history : ModelMessageHistory[] = [
                {
                    "role": ModelRole.SYSTEM,
                    "content": `Search results from knowledge base:\n
                    ${searchResults.map(s => `Result ID: ${s.id}\nResult Title:${s.metadata.title}\nResult Content:\n${s.text}\n\n`)}`
                }
            ];

            //todo: need to make this be able to pull in search queries
            const sectionContent = await this.llmService.sendMessageToLLM(`Write a section on ${task.title}: ${task.description}`, history);

            this.projects.updateTask(task.id, {
                props: {
                    ...task.props,
                    contentBlockId: randomUUID(),
                    content: sectionContent
                }
            });
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
        const sourceMessage = project.metadata?.originalPostId;
        if (!sourceMessage) {
            return;
        }

        // Get all completed tasks for this project
        const tasks = await this.projects.getAllTasks(project.id);
        const completedTasks = tasks.filter(task => task.complete);

        // Compile content from all tasks
        const content = completedTasks
            .map(task => (task as ContentTask).content)
            .filter(Boolean)
            .join('\n\n');


        const replyTo = await this.getMessage(sourceMessage)

        // Reply to the original message
        if (replyTo) {
            await this.reply(
                replyTo,
                {
                    message: `Content generation completed!\n\n${content}`
                },
                {
                    "project-id": project.id
                }
            );
        } else {
            Logger.warn("Content generation completed, but could not find a post to reply with the information.");
        }
    }


}
