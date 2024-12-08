import { randomUUID } from 'crypto';
import { Agent, HandleActivity, HandlerParams, ResponseType } from './agents';
import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from 'src/chat/chatClient';
import LMStudioService, { ModelMessageHistory } from 'src/llm/lmstudioService';
import { CONTENT_CREATION_CHANNEL_ID, CONTENT_WRITER_USER_ID, PROJECTS_CHANNEL_ID } from 'src/helpers/config';
import Logger from 'src/helpers/logger';
import { TaskManager } from 'src/tools/taskManager';
import { ContentProject, ContentTask } from './contentManager';
import ChromaDBService from 'src/llm/chromaService';

export class ContentWriter extends Agent<ContentProject, ContentTask> {
    private isWorking: boolean = false;

    constructor(chatClient: ChatClient, lmStudioService: LMStudioService, projects: TaskManager, chromaDBService: ChromaDBService) {
        super(chatClient, lmStudioService, CONTENT_WRITER_USER_ID, projects, chromaDBService);
        super.setupChatMonitor(CONTENT_CREATION_CHANNEL_ID, "@writer");
    }

    protected async taskNotification(task: ContentTask): Promise<void> {
        await this.processTask(task);
    }

    async processTaskQueue(): Promise<void> {
        const task : ContentTask = await this.projects.getNextTaskForUser(this.userId);
        if (!task) {
            Logger.info("No more tasks for user.");
            return;
        }

        await this.processTask(task);
    }

    async processTask(task: ContentTask) {
        if (this.isWorking) return;
        try {
            this.isWorking = true;
            
            const searchResults = await this.chromaDBService.query([task.description], undefined, 10);
            const history : ModelMessageHistory[] = [
                {
                    "role": "system",
                    "content": `Search results from knowledge base:\n
                    ${searchResults.map(s => `Result ID: ${s.id}\nResult Title:${s.metadata.title}\nResult Content:\n${s.text}\n\n`)}`
                }
            ];

            //todo: need to make this be able to pull in search queries
            const sectionContent = await this.lmStudioService.sendMessageToLLM(`Write a section on ${task.title}: ${task.description}`, history);
    
            task.content = sectionContent;
            task.contentBlockId = randomUUID();
        } catch (error) {
            //todo: remove failed tasks or mark completed, causes infinite loop right now
            Logger.error(`Error processing task "${task.title} ${task.description}"`, error);
        } finally {
            //todo: remove failed tasks or mark completed, causes infinite loop right now
            await this.projects.completeTask(task.id);
            this.isWorking = false;
            // Recursively process the next task
            await this.processTaskQueue();
        }
    }

    protected projectCompleted(project: ContentProject): void {
        throw new Error('Method not implemented.');
    }
}