import { randomUUID } from 'crypto';
import JSON5 from 'json5';
import Logger from '../helpers/logger';
import { Agent, HandleActivity, ResponseType } from './agents';
import { Project, TaskManager } from "src/tools/taskManager";
import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from 'src/chat/chatClient';
import LMStudioService, { StructuredOutputPrompt } from 'src/llm/lmstudioService';
import { CHROMA_COLLECTION, CONTENT_MANAGER_USER_ID, CONTENT_WRITER_USER_ID, PROJECTS_CHANNEL_ID } from 'src/helpers/config';
import { Task } from "src/tools/taskManager";
import { saveToFile } from 'src/tools/storeToFile';
import { CONTENT_DECOMPOSITION_SCHEMA, CONTENT_DECOMPOSITION_SYSTEM_PROMPT, ContentDecompositionPrompt, LOOKUP_RESEARCH_SCHEMA, LOOKUP_RESEARCH_SYSTEM_PROMPT, LookupResearchPrompt } from './schemas/contentSchemas';

export enum ContentManagerActivityType {
    CreateBlogPost = "create-blog-post",
    CreateOutline = "create-outline",
    
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

    async decomposeContent(instructions: ChatPost, priorProject?: ContentProject): Promise<ContentProject> {
        try {
            const userPrompt = instructions.message;
            const history = [
                { role: "system", content: CONTENT_DECOMPOSITION_SYSTEM_PROMPT }
            ];
            if (priorProject?.goal) {
                history.push({
                    role: "user", content: `Goal:${priorProject.goal}`
                });
            }
            if (priorProject?.tasks) {
                history.push({
                    role: "assistant", content: `Prior Outline:\n\n${Object.values(priorProject.tasks).map(c => ` - ${c.description}`).join('\n')}`
                });
            }
            if (priorProject?.research) {
                history.push({
                    role: "assistant", content: `Available Research:\n\n${Object.values(priorProject.research).map(c => ` - ${c}`).join('\n\n')}`
                });
            }

            const responseJSON = await this.lmStudioService.sendStructuredRequest(userPrompt, ContentDecompositionPrompt, history);

            const project: ContentProject = {
                goal: responseJSON.goal,
                originalPost: instructions,
                id: this.projects.newProjectId(),
                name: responseJSON.goal,
                description: responseJSON.strategy,
                tasks: {}
            }

            for (const section of responseJSON.sections) {
                const task: ContentTask = {
                    title: section.title,
                    description: section.overview,
                    id: randomUUID(),
                    complete: false,
                    creator: CONTENT_MANAGER_USER_ID,
                    contentBlockId: randomUUID(),
                    projectId: project.id,
                    type: 'content-creation'
                };
                project.tasks[task.id] = task;
            }

            return project;
        } catch (error) {
            Logger.error('Error decomposing content:', error);
            throw error;
        }
    }

    @HandleActivity(ContentManagerActivityType.CreateBlogPost, "STEP 1: Begin content project", ResponseType.CHANNEL)
    private async handleBlogPostResearch(channelId: string, instructions: ChatPost) {
        try {
            const interpretationJSON = await this.lmStudioService.sendStructuredRequest(
                instructions.message,
                LookupResearchPrompt
            );

            // Generate a query for the RAG system based on the interpreted goal
            const queryTexts = [interpretationJSON.query.trim()];

            // Search for relevant documents using ChromaDBService
            const where: any = undefined; // Add any metadata filtering conditions here if needed
            const nResults = 5; // Number of results to fetch

            const searchResults = await this.chromaDBService.query(queryTexts, where, nResults);

            // Summarize the research and ask for user permission
            const researchSummary = searchResults.documents.join('\n\n');
            const permissionPrompt = `
                Based on your request, here is the research I found:

                ${researchSummary}

                Can we proceed with creating a content outline?
            `;

            const project: ContentProject = {
                originalPost: instructions,
                id: this.projects.newProjectId(),
                name: interpretationJSON.reinterpreted_goal,
                goal: interpretationJSON.reinterpreted_goal,
                description: "Research for content creation",
                research: searchResults.documents // Include the research in the project
            };
            await this.chatClient.createPost(PROJECTS_CHANNEL_ID, permissionPrompt, {
                'project-id': project.id,
                'activity-type': ContentManagerActivityType.CreateBlogPost
            });

            this.projects.addProject(project);
        } catch (error) {
            Logger.error('Error decomposing content:', error);
            throw error;
        }
    }

    @HandleActivity(ContentManagerActivityType.CreateOutline, "STEP 2: Generate content outline", ResponseType.RESPONSE)
    private async handleCreateBlogPost(channelId: string, post: ChatPost, projectChain: ProjectChainResponse) {
        const existingProject : ContentProject = this.projects.getProject(projectChain.projectId);
        const project = await this.decomposeContent(post, existingProject);

        const confirmationMessage = `${project.goal}\nHere is an outline. Want me to ask the writes to develop the sections? 
${project.goal}?\n\n${Object.values(project.tasks).map(c => ` - ${c.description}`).join('\n')}`;

        const confirmationPost = await this.chatClient.createPost(channelId, confirmationMessage, {
            'project-id': project.id,
            'activity-type': ContentManagerActivityType.CreateBlogPost
        });

        this.projects.addProject(project);
    }

    @HandleActivity(ContentManagerActivityType.ConfirmCreateBlogPost, "STEP 3: Convert outline to full sections", ResponseType.RESPONSE)
    private async handleConfirmCreateBlogPost(channelId: string, post: ChatPost, projectChain: ProjectChainResponse) {
        const projectId = projectChain.projectId;
        const project : ContentProject = this.projects.getProject(projectId);

        if (projectId && project.tasks) {
            const contentPost = await this.replyWithContentId(ContentManagerActivityType.CreateBlogPost, projectId, channelId, post);
            await this.postContentDetails(projectId, channelId, contentPost);
            const taskIds = Object.keys(this.projects.getProject(projectId).tasks);
            for (const taskId of taskIds) {
                await this.projects.assignTaskToAgent(taskId, CONTENT_WRITER_USER_ID);
            }
        } else {
            Logger.error("Trying to start content writing, but no tasks found.");
        }
    }

    @HandleActivity(ContentManagerActivityType.ReviseOutline, "STEP 2b: Revise outline", ResponseType.RESPONSE)
    private async handleReviseOutline(channelId: string, post: ChatPost, projectChain: ProjectChainResponse) {
        const projectId = projectChain.projectId;
        const projectDraft: ContentProject = this.projects.getProject(projectId);

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
        const project: ContentProject = this.projects.getProject(projectId);
        const contentDetailsMessage = `
Strategy: ${project.description}

Sections created successfully:
${Object.values(project.tasks).map(({ description }) => ` - ${description}`).join("\n")}`;

        const contentTaskPost = await this.chatClient.postReply(contentPost.id, channelId, contentDetailsMessage);
        return contentTaskPost;
    }

}   