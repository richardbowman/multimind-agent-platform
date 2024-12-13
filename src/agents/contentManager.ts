import { randomUUID } from 'crypto';
import Logger from '../helpers/logger';
import { Agent, HandleActivity, HandlerParams, ProjectHandlerParams, ResponseType } from './agents';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { Project, TaskManager } from "src/tools/taskManager";
import { ChatClient, ChatPost, ConversationContext, ProjectChainResponse } from 'src/chat/chatClient';
import LMStudioService from 'src/llm/lmstudioService';
import { CHROMA_COLLECTION, CONTENT_MANAGER_USER_ID, CONTENT_WRITER_USER_ID, PROJECTS_CHANNEL_ID } from 'src/helpers/config';
import { Task } from "src/tools/taskManager";
import { CONTENT_DECOMPOSITION_SYSTEM_PROMPT, ContentDecompositionPrompt, LOOKUP_RESEARCH_SYSTEM_PROMPT, LookupResearchPrompt } from '../schemas/contentSchemas';
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact } from 'src/tools/artifact';
import { WritingExecutor } from './executors/WritingExecutor';
import { EditingExecutor } from './executors/EditingExecutor';
import ChromaDBService from 'src/llm/chromaService';
import { OutlineExecutor } from './executors/OutlineExecutor';
import { KnowledgeCheckExecutor } from './executors/ResearchExecutor';
import { OnboardingProject } from './goalBasedOnboardingConsultant';
import { StepBasedAgent } from './stepBasedAgent';
import { Handler } from 'puppeteer';

export interface ContentProject extends Project<ContentTask> {
    goal: string;
    description: string;
}

export interface ContentTask extends Task {
    title?: string;
    content?: string;
}

export class ContentManager extends StepBasedAgent<ContentProject, ContentTask> {
    constructor(params: AgentConstructorParams) {
        super(params);

        // Register our specialized executors
        this.registerStepExecutor(new KnowledgeCheckExecutor(lmStudioService, chromaDBService));
        this.registerStepExecutor(new OutlineExecutor(lmStudioService));
        this.registerStepExecutor(new WritingExecutor(lmStudioService, projects));
        this.registerStepExecutor(new EditingExecutor(lmStudioService));

        this.modelHelpers.setPurpose(`You are planning how to create high-quality content.
Break down the content creation into steps of research, outlining, writing and editing.
Use 'check-knowledge' steps to gather information, 'outline' steps to structure the content,
'writing' steps to develop sections, and 'editing' steps to improve quality.

IMPORTANT: Always follow this pattern:
1. Start with a 'check-knowledge' step to gather relevant information
2. Follow with an 'outline' step to structure the content
3. Then you can 'assign-writers' to have the writers create the sections
4. End with 'editing' steps to improve the final content`);
    }

    protected taskNotification(task: ContentTask): Promise<void> {
        try {
            if (task.type === "assign-writers") {
                if (task.complete) {
                    const project = this.projects.getProject(task.projectId);

                    this.planSteps({ 
                        message: "Writers completed tasks.", 
                        projects: [project]
                    } as HandlerParams);
                }
            } else {
                super.taskNotification(task);
            }
        } catch (error) {
            Logger.error('Error handling task:', error);
            throw error;
        }        
    }

    protected async processTask(task: Task): Promise<void> {

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

        //TODO: hack for now, we don't assign workign steps to agent right now
        await this.projects.assignTaskToAgent(project.metadata.parentTaskId, CONTENT_MANAGER_USER_ID);

        if (project.metadata.parentTaskId) {
            this.projects.completeTask(project.metadata.parentTaskId);
            const parentTask = await this.projects.getTaskById(project.metadata.parentTaskId);
            const parentProject = await this.projects.getProject(parentTask.projectId);
        
            const post = await this.chatClient.getPost(parentProject.metadata.originalPostId);
            this.reply(post, { message: responseMessage }, {
                "artifact-ids": [content.id]
            });
        } else {
            this.chatClient.postInChannel(PROJECTS_CHANNEL_ID, responseMessage, {
                "artifact-ids": [content.id]
            });
        }
    }

    public async initialize(): Promise<void> {
        await super.setupChatMonitor(PROJECTS_CHANNEL_ID, "@content");
        this.processTaskQueue();
    }

    @HandleActivity("start-thread", "Start conversation with user", ResponseType.CHANNEL)
    protected async handleConversation(params: HandlerParams): Promise<void> {
        const { projectId } = await this.addNewProject({
            projectName: `Kickoff onboarding based on incoming message: ${params.userPost.message}`,
            tasks: [],
            metadata: {
                originalPostId: params.userPost.id
            }
        });
        const project = await this.projects.getProject(projectId);

        params.projects = [...params.projects || [], project]
        const plan = await this.planSteps(params);
        await this.executeNextStep(projectId, params.userPost);
    }

    @HandleActivity("response", "Handle responses on the thread", ResponseType.RESPONSE)
    protected async handleThreadResponse(params: HandlerParams): Promise<void> {
        const project = params.projects?.[0] as OnboardingProject;

        // If no active project, treat it as a new conversation
        if (!project) {
            Logger.info("No active project found, starting new conversation");
            const { projectId } = await this.addNewProject({
                projectName: params.userPost.message,
                tasks: [],
                metadata: {
                    originalPostId: params.userPost.id
                }
            });
            const project = await this.projects.getProject(projectId);
            params.projects = [...params.projects || [], project]

            const plan = await this.planSteps(params);
            await this.executeNextStep(projectId, params.userPost);
            return;
        }

        // Handle response to existing project
        const currentTask = Object.values(project.tasks).find(t => t.inProgress);
        if (!currentTask) {
            Logger.info("No active task, treating as new query in existing project");
            const plan = await this.planSteps(params);
            await this.executeNextStep(project.id, params.userPost);
            return;
        }

        // Handle response to active task
        const plan = await this.planSteps(params);
        await this.executeNextStep(project.id, params.userPost);
    }
}   
