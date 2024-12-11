import { randomUUID } from 'crypto';
import Logger from '../helpers/logger';
import { Agent, HandleActivity, HandlerParams, ProjectHandlerParams, ResponseType } from './agents';
import { Project, TaskManager } from "src/tools/taskManager";
import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from 'src/chat/chatClient';
import LMStudioService from 'src/llm/lmstudioService';
import { CHROMA_COLLECTION, CONTENT_MANAGER_USER_ID, CONTENT_WRITER_USER_ID, PROJECTS_CHANNEL_ID } from 'src/helpers/config';
import { Task } from "src/tools/taskManager";
import { CONTENT_DECOMPOSITION_SYSTEM_PROMPT, ContentDecompositionPrompt, LOOKUP_RESEARCH_SYSTEM_PROMPT, LookupResearchPrompt } from './schemas/contentSchemas';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact } from 'src/tools/artifact';
import { WritingExecutor } from './executors/WritingExecutor';
import { EditingExecutor } from './executors/EditingExecutor';

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

export class ContentManager extends StepBasedAgent<ContentProject, ContentTask> {
    constructor(
        chatClient: ChatClient,
        lmStudioService: LMStudioService,
        userId: string,
        projects: TaskManager,
        chromaDBService: ChromaDBService
    ) {
        super(chatClient, lmStudioService, userId, projects, chromaDBService);

        // Register our specialized executors
        this.registerStepExecutor(new ResearchExecutor(lmStudioService));
        this.registerStepExecutor(new OutlineExecutor(lmStudioService));
        this.registerStepExecutor(new WritingExecutor(lmStudioService));
        this.registerStepExecutor(new EditingExecutor(lmStudioService));

        this.setPurpose(`You are planning how to create high-quality content.
Break down the content creation into steps of research, outlining, writing and editing.
Use 'research' steps to gather information, 'outline' steps to structure the content,
'writing' steps to develop sections, and 'editing' steps to improve quality.

IMPORTANT: Always follow this pattern:
1. Start with a 'research' step to gather relevant information
2. Follow with an 'outline' step to structure the content
3. Use 'writing' steps to develop each section
4. End with 'editing' steps to improve the final content`);
    }

    protected async processTask(task: ContentTask): Promise<void> {
        try {
            const instructions = task.description;

            if (!instructions) {
                throw new Error('No original post found for the task.');
            }

            // Step 1: Begin content project
            const interpretationJSON = await this.generate({
                instructions: LookupResearchPrompt,
                message: task.description
            });

            const queryTexts = [interpretationJSON.query.trim()];
            const where: any = undefined;
            const nResults = 5;

            const searchResults = await this.chromaDBService.query(queryTexts, where, nResults);

            const researchSummaryInput = `Search results from knowledge base:\n${searchResults.map(s => `Result ID: ${s.id}\nResult Title:${s.metadata.title}\nResult Content:\n${s.text}\n\n`)}`;

            const responsePrompt = `
                You are the research manager. Your goal is to develop content that addresses the user's goal they provide.
                
                Here are some research findings to help you develop the content structure:
                ${researchSummaryInput}

                Write a chat message reply to the user including a summary of the research, and ask if we can proceed with creating a content outline.
            `;

            const response = await this.lmStudioService.generate(responsePrompt, { message: instructions });

            const project: ContentProject = {
                // originalPost: instructions,
                id: this.projects.newProjectId(),
                name: interpretationJSON.reinterpreted_goal,
                goal: interpretationJSON.reinterpreted_goal,
                description: task.description,
                parentTaskId: task.id,
                research: searchResults
            };

            this.projects.addProject(project);

            // Step 2: Generate content outline
            const existingProject = this.projects.getProject(project.id);
            const decomposedProject = await this.decomposeContent({ message: task.description }, project);

            project.tasks = decomposedProject.tasks;
            this.projects.replaceProject(project);

            // Post the task list to the channel
            const parentProject = await this.projects.getProject(task.projectId);
            const post = await this.getMessage(parentProject.originalPostId);
            const projectPost = await this.reply(post, response, {
                "project-id": project.id
            });

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

        if (project.parentTaskId) this.projects.completeTask(project.parentTaskId);
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

    public async initialize(): Promise<void> {
        await this.chromaDBService.initializeCollection(CHROMA_COLLECTION);
        await super.setupChatMonitor(PROJECTS_CHANNEL_ID, "@content");
        this.processTaskQueue();
    }

    @HandleActivity("start-content", "Start content creation process", ResponseType.CHANNEL)
    protected async handleContentRequest(params: HandlerParams): Promise<void> {
        const { projectId } = await this.addNewProject({
            projectName: `Content creation: ${params.userPost.message}`,
            tasks: [],
            metadata: {
                originalPostId: params.userPost.id,
                goal: params.userPost.message
            }
        });
        
        const project = await this.projects.getProject(projectId);
        params.projects = [...params.projects || [], project];
        
        // Define the standard content creation steps
        const steps = [
            {
                type: 'research',
                description: 'Research relevant content and gather information'
            },
            {
                type: 'outline',
                description: 'Create structured content outline based on research'
            }
        ];
        
        await this.setProjectSteps(projectId, steps);
        await this.executeNextStep(projectId, params.userPost);
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
                    description: `${section.description} [${project.goal}]`,
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

    @HandleActivity("start-thread", "Start conversation with user", ResponseType.CHANNEL)
    protected async handleConversation(params: HandlerParams): Promise<void> {
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

    @HandleActivity("response", "Handle responses on the thread", ResponseType.RESPONSE)
    protected async handleThreadResponse(params: HandlerParams): Promise<void> {
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
            
            // Get the research and outline results from previous steps
            const researchResults = await this.getStepResult(projectId, 'research');
            const outlineResults = await this.getStepResult(projectId, 'outline');
            
            // Create writing tasks for each section
            const taskIds = Object.keys(project.tasks);
            for (const taskId of taskIds) {
                const task = project.tasks[taskId];
                
                // Create a writing task with context
                const writingTask = {
                    ...task,
                    type: 'writing',
                    context: {
                        research: researchResults,
                        outline: outlineResults,
                        section: task.description
                    }
                };
                
                // Update the task in the project
                project.tasks[taskId] = writingTask;
                
                // Assign to content writer
                await this.projects.assignTaskToAgent(taskId, CONTENT_WRITER_USER_ID);
            }
            
            // Update the project with the modified tasks
            this.projects.replaceProject(project);
            
            // Notify about task assignments
            await this.reply(contentPost, {
                message: `I've assigned ${taskIds.length} writing tasks to our content writer. They will develop each section using our research and outline.`
            });
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
