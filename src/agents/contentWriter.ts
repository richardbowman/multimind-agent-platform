import { randomUUID } from 'crypto';
import { Agent, HandleActivity, ResponseType } from './agents';
import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from 'src/chat/chatClient';
import LMStudioService from 'src/llm/lmstudioService';
import { CONTENT_CREATION_CHANNEL_ID, CONTENT_WRITER_USER_ID, PROJECTS_CHANNEL_ID } from 'src/helpers/config';
import Logger from 'src/helpers/logger';
import { TaskManager } from 'src/tools/taskManager';
import { ContentProject, ContentTask } from './contentManager';

export class ContentWriter extends Agent<ContentProject, ContentTask> {
    constructor(chatClient: ChatClient, lmStudioService: LMStudioService, projects: TaskManager) {
        super(chatClient, lmStudioService, CONTENT_WRITER_USER_ID, projects);
    }

    public async initialize() {
        super.setupChatMonitor(CONTENT_CREATION_CHANNEL_ID, "@writer");
    }

    protected async taskNotification(task: ContentTask): Promise<void> {
        const sectionDescription = task.description;

        const sectionContent = await this.lmStudioService.sendMessageToLLM(`Write a section on ${task.name}: ${task.description}`, [], "", 8192);

        const project : ContentProject = this.projects.getProject(task.projectId);
        task.content = sectionContent;
        task.contentBlockId = randomUUID();

        this.projects.completeTask(task.id);

        await this.chatClient.postReply(project.confirmationPostId, PROJECTS_CHANNEL_ID, `Finished section: ${sectionDescription}`, {
            
        });
    }

    protected projectCompleted(project: ContentProject): void {
        throw new Error('Method not implemented.');
    }

    @HandleActivity('update-section', "Update an existing section of content.", ResponseType.RESPONSE)
    private async handleUpdateSection(channelId: string, post: ChatPost) {
        const contentId = post.props['content-id'];
        const sectionDescription = post.message;
        const updatedContent = post.reply;

        // Update the section in workflow
        const contentWorkflow = new ContentWorkflow(contentId, "update-section", this.lmStudioService, this.projects, this.chromaDBService);
        contentWorkflow.updateSection(sectionDescription, updatedContent);

        await this.chatClient.postReply(post.id, channelId, `Updated section: ${sectionDescription}`);
    }
}