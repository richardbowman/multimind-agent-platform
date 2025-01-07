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
    protected handleChannel(params: HandlerParams): Promise<void> {
        throw new Error('Method not implemented.');
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

    protected projectCompleted(project: ContentProject): void {
        throw new Error('Method not implemented.');
    }


}
