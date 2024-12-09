import { randomUUID } from 'crypto';
import Logger from '../helpers/logger';
import { Agent, HandleActivity, HandlerParams, ProjectHandlerParams, ResponseType } from './agents';
import { Project, TaskManager } from "src/tools/taskManager";
import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from 'src/chat/chatClient';
import LMStudioService from 'src/llm/lmstudioService';
import { CHROMA_COLLECTION, CONTENT_MANAGER_USER_ID, CONTENT_WRITER_USER_ID, PROJECTS_CHANNEL_ID } from 'src/helpers/config';
import { Task } from "src/tools/taskManager";
import { CONTENT_DECOMPOSITION_SYSTEM_PROMPT, ContentDecompositionPrompt, LookupResearchPrompt } from './schemas/contentSchemas';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact } from 'src/tools/artifact';

export enum ContentManagerActivityType {
    CreateDocument = "create-document",
    CreateOutline = "create-outline",
    
    ReceivedSection = "received-content-section",
    UpdateDocument = "update-document",
    CombineContent = "received-all-content",
    ConfirmCreateFullContent = "confirm-create-full-content",
    ReviseOutline = "revise-content-outline"
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
    private artifactManager: ArtifactManager;

    public async taskNotification(task: ContentTask): Promise<void> {
        try {
            const instructions = task.description;

            if (!instructions) {
                throw new Error('No original post found for the task.');
            }

            // Step 1: Begin content project
            const interpretationJSON = await this.lmStudioService.sendStructuredRequest(
                task.description,
                LookupResearchPrompt
            );

            const queryTexts = [interpretationJSON.query.trim()];
            const where: any = undefined;
            const nResults = 5;

            const searchResults = await this.chromaDBService.query(queryTexts, where, nResults);

            const researchSummaryInput = `Search results from knowledge base:\n${searchResults.map(s => `Result ID: ${s.id}\nResult Title:${s.metadata.title}\nResult Content:\n${s.text}\n\n`)}`;

            const responsePrompt = `
                You are an assistant helping to create content. Here are some research findings:

                ${researchSummaryInput}

                Write a conversational chat message reply to the user including a summary of the research, and ask if we can proceed with creating a content outline.
            `;

            const response = await this.lmStudioService.generate(responsePrompt, { message: instructions });

            const project: ContentProject = {
                // originalPost: instructions,
                id: task.projectId || this.projects.newProjectId(),
                name: interpretationJSON.reinterpreted_goal,
                goal: interpretationJSON.reinterpreted_goal,
                description: "Research for content creation",
                research: searchResults
            };

            this.projects.addProject(project);

            // Step 2: Generate content outline
            const existingProject = this.projects.getProject(project.id);
            const decomposedProject = await this.decomposeContent({ message: task.description }, existingProject);

            project.tasks = decomposedProject.tasks;
            this.projects.replaceProject(project);

            // Step 3: Convert outline to full sections
            if (project?.tasks) {
                const taskIds = Object.keys(this.projects.getProject(project.id).tasks);
                for (const taskId of taskIds) {
                    await this.projects.assignTaskToAgent(taskId, CONTENT_WRITER_USER_ID);
                }
            } else {
                Logger.error("Trying to start content writing, but no tasks found.");
            }

        } catch (error) {
            Logger.error('Error handling task:', error);
            throw error;
        }
    }

    protected async projectCompleted(project: ContentProject): Promise<void> {
        const finalContent = Object.values(project.tasks).reduce((acc, task) => acc + task.content, '\n\n');
        const responseMessage = `The combined content has been shared:\n${finalContent}`;
        const content : Artifact = {
            id: randomUUID(),
            content: finalContent,
            type: "content",
            metadata: {
                goal: project.goal,
                projectId: project.id
            }
        }
        this.artifactManager.saveArtifact(content);
        this.chatClient.postInChannel(PROJECTS_CHANNEL_ID, responseMessage);
    }


    private USER_TOKEN: string;
    private overallGoal = `
My goal is to help our users create long-form content. I can do that by helping craft
content outlines, revising that outline as the user requests, and then working with
writers to develop content sections.`;

    constructor(chatUserToken: string, userId: string, chatClient: ChatClient, lmStudioService: LMStudioService, projects: TaskManager) {
        super(chatClient, lmStudioService, userId, projects);
        this.USER_TOKEN = chatUserToken;
        this.artifactManager = new ArtifactManager(this.chromaDBService);
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
                id: priorProject.id,
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

    @HandleActivity(ContentManagerActivityType.CreateDocument, "STEP 1: Begin content project", ResponseType.CHANNEL)
    private async handleBlogPostResearch(params: HandlerParams) {
        try {
            const interpretationJSON = await this.lmStudioService.sendStructuredRequest(
                params.userPost.message,
                LookupResearchPrompt
            );
    
            // Generate a query for the RAG system based on the interpreted goal
            const queryTexts = [interpretationJSON.query.trim()];
    
            // Search for relevant documents using ChromaDBService
            const where: any = undefined; // Add any metadata filtering conditions here if needed
            const nResults = 5; // Number of results to fetch
    
            const searchResults = await this.chromaDBService.query(queryTexts, where, nResults);
    
            // Combine the research documents into a single string
            const researchSummaryInput = `Search results from knowledge base:\n${params.searchResults.map(s => `Result ID: ${s.id}\nResult Title:${s.metadata.title}\nResult Content:\n${s.text}\n\n`)}`;
    
            // Generate a summary of the research and the permission prompt in one call using the LLM
            const responsePrompt = `
                You are an assistant helping to create content. Here are some research findings:
    
                ${researchSummaryInput}
    
                Write a conversational chat message reply to the user including a summary of the research, and ask if we can proceed with creating a content outline.
            `;
    
            const response = await this.lmStudioService.generate(responsePrompt, params.userPost);
    
            const project: ContentProject = {
                originalPost: params.userPost,
                id: this.projects.newProjectId(),
                name: interpretationJSON.reinterpreted_goal,
                goal: interpretationJSON.reinterpreted_goal,
                description: "Research for content creation",
                research: searchResults.documents // Include the research in the project
            };
            
            const chatResponse = await this.reply(params.userPost, response, {
                'project-id': project.id,
                'activity-type': ContentManagerActivityType.CreateDocument
            });
            project.confirmationPostId = chatResponse.id;
    
            this.projects.addProject(project);
        } catch (error) {
            Logger.error('Error decomposing content:', error);
            throw error;
        }
    }

    @HandleActivity(ContentManagerActivityType.CreateOutline, "STEP 2: Generate content outline", ResponseType.RESPONSE)
    private async handleCreateBlogPost(params: ProjectHandlerParams) {
        const existingProject : ContentProject = this.projects.getProject(params.projectChain.projectId);
        const project = await this.decomposeContent(params.userPost, existingProject);
    
        // Prepare history for LLM
        const instructions = `You are the content manager (@content). Help the user to confirm if they would like the writers to proceed in developing sections based on
the outline you developed below. Summarize the outline and ask the user to confirm if they want the writers to flesh out the outline.
Goal: ${project.goal}
Writer Tasks: ${Object.values(project.tasks).map(c => ` - ${c.description}`).join('\n')}`;
    
        // Call LLM to generate response
        const llmResponse = await this.generateOld(instructions, params);
    
        // Create the post with the LLM generated response
        const confirmationPost = await this.reply(params.userPost, llmResponse, {
            'project-id': project.id,
            'activity-type': ContentManagerActivityType.CreateDocument
        });
        project.confirmationPostId = confirmationPost.id;
    
        this.projects.replaceProject(project);
    }

    @HandleActivity(ContentManagerActivityType.ConfirmCreateFullContent, "STEP 3: Convert outline to full sections", ResponseType.RESPONSE)
    private async handleConfirmCreateBlogPost(params: ProjectHandlerParams) {
        const projectId = params.projectChain.projectId;
        const project : ContentProject = this.projects.getProject(projectId);

        if (projectId && project?.tasks) {
            const contentPost = await this.replyWithContentId(ContentManagerActivityType.CreateDocument, projectId, params.userPost.channel_id, params.userPost);
            await this.postContentDetails(projectId, params.userPost.channel_id, contentPost);
            const taskIds = Object.keys(this.projects.getProject(projectId).tasks);
            for (const taskId of taskIds) {
                await this.projects.assignTaskToAgent(taskId, CONTENT_WRITER_USER_ID);
            }
        } else {
            Logger.error("Trying to start content writing, but no tasks found.");
        }
    }

    @HandleActivity(ContentManagerActivityType.ReviseOutline, "STEP 2b: Revise outline", ResponseType.RESPONSE)
    private async handleReviseOutline(params: ProjectHandlerParams) {
        const projectId = params.projectChain.projectId;
        const existingProject : ContentProject = this.projects.getProject(projectId);

        if (existingProject) {
            const project = await this.decomposeContent(params.userPost, existingProject);
        
            // Prepare history for LLM
            const instructions = `You are an assistant helping a user to confirm if they would like the writers to proceed in developing sections based on
    the outline you developed below. Summarize the outline and ask the user to confirm if they want the writers to flesh out the outline.
    Goal: ${project.goal}
    Writer Tasks: ${Object.values(project.tasks).map(c => ` - ${c.description}`).join('\n')}`;
        
            // Call LLM to generate response
            const llmResponse = await this.generateOld(instructions, params);
        
            // Create the post with the LLM generated response
            const confirmationPost = await this.reply(params.userPost, llmResponse, {
                'project-id': project.id,
                'activity-type': ContentManagerActivityType.CreateDocument
            });
            project.confirmationPostId = confirmationPost.id;

            this.projects.replaceProject(project);
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
        return this.reply(post, { message: responseMessage }, postProps);
    }

    private async postContentDetails(projectId: string, channelId: string, contentPost: ChatPost): Promise<ChatPost> {
        const project: ContentProject = this.projects.getProject(projectId);
        const contentDetailsMessage = `
Strategy: ${project.description}

Sections created successfully:
${Object.values(project.tasks).map(({ description }) => ` - ${description}`).join("\n")}`;

        const contentTaskPost = await this.chatClient.postReply(contentPost.getRootId(), channelId, contentDetailsMessage);
        return contentTaskPost;
    }

}   