import { randomUUID } from 'crypto';
import JSON5 from 'json5';
import Logger from '../helpers/logger';
import { Agent, HandleActivity, ResponseType } from './agents';
import { Project, TaskManager } from "src/tools/taskManager";
import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from 'src/chat/chatClient';
import LMStudioService from 'src/llm/lmstudioService';
import { CHROMA_COLLECTION, CONTENT_MANAGER_USER_ID, CONTENT_WRITER_USER_ID, PROJECTS_CHANNEL_ID } from 'src/helpers/config';
import { Task } from "src/tools/taskManager";
import { saveToFile } from 'src/tools/storeToFile';
import { Touchscreen } from 'puppeteer';

export enum ContentManagerActivityType {
    CreateBlogPost = "create-blog-post",
    ReceivedSection = "received-content-section",
    UpdateContent = "update-blog-post",
    CombineContent = "received-all-content",
    ConfirmCreateBlogPost = "confirm-create-blog-post",
    ReviseOutline = "ReviseOutline"
}

export interface ContentProject extends Project<ContentTask> {
    originalPost: ChatPost;
    confirmationPostId?: string;
    goal: string;
    description: string;
}

export interface ContentTask extends Task {
    title?: string;
    content?: string;
}

export class ContentManager extends Agent<ContentProject, ContentTask> {
    protected taskNotification(task: ContentTask): void {
        throw new Error('Method not implemented.');
    }

    protected async projectCompleted(project: ContentProject): Promise<void> {
        const finalContent = Object.values(project.tasks).reduce((acc, task) => acc + task.content, '\n\n');
        const responseMessage = `The combined content has been shared:\n${finalContent}`;
        await saveToFile(project.id, "content", "combined", finalContent)
        this.chatClient.createPost(PROJECTS_CHANNEL_ID, responseMessage);
    }


    private USER_TOKEN: string;
    private overallGoal = `
My goal is to help our users create long-form content. I can do that by helping craft
content outlines, revising that outline as the user requests, and then working with
writers to develop content sections.`;    

    constructor(chatUserToken: string, userId: string, chatClient: ChatClient, lmStudioService: LMStudioService, projects: TaskManager) {
        super(chatClient, lmStudioService, userId, projects);
        this.USER_TOKEN = chatUserToken;
    }

    public async initialize() {
        await this.chromaDBService.initializeCollection(CHROMA_COLLECTION);
        super.setupChatMonitor(PROJECTS_CHANNEL_ID, "@content");
    }

    async decomposeContent(instructions: ChatPost, priorProject?: ContentProject) : Promise<ContentProject> {
        try {
            const schema = {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "title": "Content Decomposition Response",
                "type": "object",
                "properties": {
                  "goal": {
                    "type": "string"
                  },
                  "strategy": {
                    "type": "string"
                  },
                  "sections": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "properties": {
                        "title": {
                          "type": "string"
                        },
                        "overview": {
                          "type": "string"
                        }
                      },
                      "required": ["title", "overview"]
                    }
                  }
                },
                "required": ["goal", "strategy", "sections"]
              };

            const systemPrompt = `
You are a content orchestrator. Your task is to analyze the user's request and break it down into manageable sections.
1. Restate the user's goal with the content request.
2. Decide how you can craft a high quality outline. If there was an original outline you developed, here it was:
 
3. Create up to ${process.env.MAX_CONTENT_SECTIONS} detailed section descriptions based on the main topic.
4. Provide only a JSON object in the format:
{
    "goal": "user's goal for the content",
    "strategy": "how i will approach this from an organizational standpoint",
    "sections": [
        {
            "title": "Section 1",
            "overview": "High level overview of this section"
        },
        ...
    ]
}
`;

            const userPrompt = instructions.message;
            const history = [
                { role: "system", content: systemPrompt }
            ];
            if (priorProject) {
                history.push({
                    role: "assistant", content: `Outline:\n\n${Object.values(priorProject.tasks).map(c => ` - ${c.description}`).join('\n')}`
                });
            }
            const response = await this.lmStudioService.sendMessageToLLM(userPrompt, history, "", 4096, 8192, schema);

            // Parse the response to extract sections
            const responseJSON = JSON5.parse(response);

            const project : ContentProject =  {
                goal: responseJSON.goal,
                originalPost: instructions,
                id: this.projects.newProjectId(),
                name: responseJSON.goal,
                description: responseJSON.strategy,
                tasks: {}
            }

            for (const section of responseJSON.sections) {
                const taskId = randomUUID();
                const task: ContentTask = {
                    title: section.title,
                    description: section.overview,
                    id: taskId,
                    complete: false,
                    creator: CONTENT_MANAGER_USER_ID,
                    projectId: project.id,
                    type: 'content-creation'
                };
                project.tasks[taskId] = task;
            }

            return project;
        } catch (error) {
            Logger.error('Error decomposing content:', error);
            throw error;
        }
    }

    @HandleActivity(ContentManagerActivityType.CreateBlogPost, "Received request to create content", ResponseType.CHANNEL)
    private async handleCreateBlogPost(channelId: string, post: ChatPost) {
        const project = await this.decomposeContent(post);

        const confirmationMessage = `Here is an outline. Want me to continue with your original goal of 
${post.message}?\n\n${Object.values(project.tasks).map(c => ` - ${c.description}`).join('\n')}`;

        const confirmationPost = await this.chatClient.createPost(channelId, confirmationMessage, {
            'project-id': project.id,
            'activity-type': ContentManagerActivityType.CreateBlogPost
        });

        this.projects.addProject(project);
    }

    @HandleActivity(ContentManagerActivityType.ConfirmCreateBlogPost, "User confirmed they want to begin content creation", ResponseType.RESPONSE)
    private async handleConfirmCreateBlogPost(channelId: string, post: ChatPost, projectChain: ProjectChainResponse) {
        const projectId = projectChain.projectId;

        if (projectId) {
            const contentPost = await this.replyWithContentId(ContentManagerActivityType.CreateBlogPost, projectId, channelId, post);
            await this.postContentDetails(projectId, channelId, contentPost);
            const taskIds = Object.keys(this.projects.getProject(projectId).tasks);
            for (const taskId of taskIds) {
                await this.projects.assignTaskToAgent(taskId, CONTENT_WRITER_USER_ID);
            }
        } else {
            Logger.error("Received confirmation response without corresponding original post.");
        }
    }

    @HandleActivity(ContentManagerActivityType.ReviseOutline, "User wants to revise the original outline", ResponseType.RESPONSE)
    private async handleReviseOutline(channelId: string, post: ChatPost, projectChain: ProjectChainResponse) {
        const projectId = projectChain.projectId;
        const projectDraft : ContentProject = this.projects.getProject(projectId);

        if (projectDraft) {
            const newProject = await this.decomposeContent(post, projectDraft);

            const confirmationMessage = `Here is the revised outline. Do you want to proceed with your original goal of 
${newProject.goal}?\n\n${Object.values(newProject.tasks).map(c => ` - ${c.description}`).join('\n')}`;

            const confirmationPost = await this.chatClient.postReply(projectChain.posts[0].id, channelId, confirmationMessage, {
                'project-id': projectId,
                'activity-type': ContentManagerActivityType.ReviseOutline
            });

            // Update the pending creation request with the new tasks
            this.projects.addProject(newProject);
        } else {
            Logger.error("Received revise outline response without corresponding original project.");
        }
    }

    private async replyWithContentId(activityType: ContentManagerActivityType, contentId: string, channelId: string, post: ChatPost): Promise<ChatPost> {
        const postProps: ConversationContext = {
            'content-id': contentId,
            'conversation-root': post.id,
            'activity-type': activityType
        };
        const responseMessage = `I've received your request for creating/updating content!
Content ID: **${contentId}**
Activity Type: **${activityType}**`;
        return this.chatClient.createPost(channelId, responseMessage, postProps);
    }

    private async postContentDetails(projectId: string, channelId: string, contentPost: ChatPost): Promise<ChatPost> {
        const project : ContentProject = this.projects.getProject(projectId);
        const contentDetailsMessage = `
Strategy: ${project.description}

Sections created successfully:
${Object.values(project.tasks).map(({ description }) => ` - ${description}`).join("\n")}`;

        const contentTaskPost = await this.chatClient.postReply(contentPost.id, channelId, contentDetailsMessage);
        return contentTaskPost;
    }

}   