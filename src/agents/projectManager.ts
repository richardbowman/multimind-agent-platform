import { randomUUID } from 'crypto';
import Logger from '../helpers/logger';
import { Agent, HandleActivity, HandlerParams, ResponseType } from './agents';
import { Project, TaskManager } from "src/tools/taskManager";
import { ChatClient } from 'src/chat/chatClient';
import LMStudioService, { StructuredOutputPrompt } from 'src/llm/lmstudioService';
import { CONTENT_MANAGER_USER_ID, PROJECTS_CHANNEL_ID, RESEARCH_MANAGER_USER_ID } from 'src/helpers/config';
import { Task } from "src/tools/taskManager";
import { Artifact } from 'src/tools/artifact';
import ChromaDBService from 'src/llm/chromaService';
import { ResearchActivityType } from './researchManager';
import { ContentManagerActivityType } from './contentManager';
import { RequestArtifacts } from './schemas/ModelResponse';

export enum ProjectManagerActivities {
    InitateBrainstorm = "initiate-brainstorm",
    ContinueBrainstorm = "continue-brainstorm",
    AnswerQuestions = "answer-questions",
    GenerateArtifact = "generate-artifact",
    KickoffResearch = "kickoff-research-project",
    KickoffContentDevelopment = "kickoff-content-development"
}

export interface PlanningProject extends Project<Task> {
    originalPostId: string;
    confirmationPostId?: string;
    goal: string;
    description: string;
}

export class ProjectManager extends Agent<PlanningProject, Task> {
    protected processTask(task: Task): Promise<void> {
        throw new Error('Method not implemented.');
    }

    protected async projectCompleted(project: PlanningProject): Promise<void> {

    }

    constructor(userId: string, messagingHandle: string, chatClient: ChatClient, lmStudioService: LMStudioService, chromaDBService: ChromaDBService, projects: TaskManager) {
        super(chatClient, lmStudioService, userId, projects, chromaDBService);
        this.setPurpose(`My name is Mesa. My goal is to help develop standardized processes for your business.`)
        this.setupChatMonitor(PROJECTS_CHANNEL_ID, messagingHandle);
    }

    
    @HandleActivity(ProjectManagerActivities.AnswerQuestions, "All initial inquries", ResponseType.CHANNEL)
    private async handleChannel(params: HandlerParams) {
        const instructions = `Here are the ways you can help when the user posts in the channel:
${this.getAvailableActions(ResponseType.CHANNEL).map(a => ` - ${a.activityType}: ${a.usage}`).join('\n')}

Here are the ways you can help respond to initial posts:
${this.getAvailableActions(ResponseType.RESPONSE).map(a => ` - ${a.activityType}: ${a.usage}`).join('\n')}

Respond to the user's request, explaining to them the other available options.`;

        const response = await this.generateOld(instructions, params);
        await this.reply(params.userPost, response);
    }


    @HandleActivity(ProjectManagerActivities.AnswerQuestions, "Follow-up questions", ResponseType.RESPONSE)
    private async handleGeneralReplies(params: HandlerParams) {
        const instructions = `Here are the ways you can help when the user posts in the channel:
${this.getAvailableActions(ResponseType.CHANNEL).map(a => ` - ${a.activityType}: ${a.usage}`).join('\n')}

Here are the ways you can help respond to initial posts:
${this.getAvailableActions(ResponseType.RESPONSE).map(a => ` - ${a.activityType}: ${a.usage}`).join('\n')}

Respond to the user's request, explaining to them the other available options.`;

        const response = await this.generateOld(instructions, params);
        await this.reply(params.userPost, response);
    }


    @HandleActivity(ProjectManagerActivities.InitateBrainstorm, "User wants my help brainstorming structured projects", ResponseType.CHANNEL)
    private async startBrainstorming(params: HandlerParams) {
        const instructions = `Generate ideas for the user based on their concept or starting point. Try not to rule out ideas and focus on being creative.`;

        const response = await this.generateOld(instructions, params);
        await this.reply(params.userPost, response);
    }

    @HandleActivity(ProjectManagerActivities.ContinueBrainstorm, "Continue brainstorming", ResponseType.RESPONSE)
    private async continueBrainstorming(params: HandlerParams) {
        const instructions = `Generate ideas for the user based on their concept or starting point. Try not to rule out ideas and focus on being creative.`;

        const response = await this.generateOld(instructions, params);
        await this.reply(params.userPost, response);
    }

    @HandleActivity(ProjectManagerActivities.GenerateArtifact, "Create/revise a Markdown document the user can refer back to later.", ResponseType.RESPONSE)
    private async generateArtifact(params: HandlerParams) {
        const instructions = `
        Generate a title, content for a Markdown document and a confirmation message based on the user's request.
        Specify the existing artifact ID if you want to revise an existing artifact. Otherwise, leave this field blank.
        Respond in JSON format with three keys: "artifactId", "title", "content", and "confirmationMessage".
    `;

        // Create a structured prompt
        const structuredPrompt = new StructuredOutputPrompt(
            {
                type: 'object',
                properties: {
                    artifactId: { type: 'string' },
                    title: { type: 'string' },
                    content: { type: 'string' },
                    confirmationMessage: { type: 'string' }
                }
            },
            instructions
        );

        try {
            // Send the structured request to LMStudioService
            const responseJSON = await this.lmStudioService.generateStructured(params.userPost, structuredPrompt, params.threadPosts);

            // Extract title, content, and confirmationMessage from the response
            const { artifactId, title, content, confirmationMessage } = responseJSON;

            // Prepare the artifact
            const artifact: Artifact = {
                id: artifactId.length > 0 ? artifactId : randomUUID(),
                type: 'markdown',
                content: content,
                metadata: {
                    title: title
                }
            };

            // Save the artifact using ArtifactManager
            await this.artifactManager.saveArtifact(artifact);

            // Reply to the user with confirmation message and artifact details
            await this.reply(params.userPost, {
                message: `${confirmationMessage} Your artifact titled "${title}" has been generated and saved. You can find it under ID: ${artifact.id}`,
                artifactIds: [artifact.id]
            } as RequestArtifacts);
        } catch (error) {
            Logger.error('Error generating artifact:', error);
            await this.reply(params.userPost, {
                message: 'Failed to generate the artifact. Please try again later.'
            });
        }
    }

    @HandleActivity(ProjectManagerActivities.KickoffResearch, "Kickoff a research project with the research team", ResponseType.RESPONSE)
    private async kickoffProject(params: HandlerParams) {
        const instructions = `
            Create a new project with a task for the research team based on user's request.
            Respond in JSON format with three keys:
            - "projectName": The name of the project
            - "projectGoal": The goal of the project
            - "taskDescription": A detailed description of the task for the research team
            - "responseMessage": A user-friendly response message to inform the user about the new project and assigned task
        `;

        // Create a structured prompt
        const structuredPrompt = new StructuredOutputPrompt(
            {
                type: 'object',
                properties: {
                    projectName: { type: 'string' },
                    projectGoal: { type: 'string' },
                    taskDescription: { type: 'string' },
                    responseMessage: { type: 'string' }
                }
            },
            instructions
        );

        try {
            // Send the structured request to LMStudioService
            const responseJSON = await this.lmStudioService.generateStructured(params.userPost, structuredPrompt, params.threadPosts);

            // Extract projectName, taskDescription, and responseMessage from the response
            const { projectName, projectGoal, taskDescription, responseMessage } = responseJSON;

            // Create a new project with a task for the research team
            const projectId = randomUUID();
            const task: Task = {
                id: randomUUID(),
                description: taskDescription,
                contentBlockId: undefined,
                creator: this.userId,
                projectId: projectId,
                type: ResearchActivityType.WebResearch,
                complete: false
            };

            // Add the project and task to the projects manager
            const newProject: PlanningProject = {
                id: projectId,
                name: projectName,
                goal: projectGoal,
                tasks: { [task.id]: task },
                originalPostId: params.userPost.id,
                description: 'A project initiated by Mesa with a task for the research team.'
            };

            this.projects.addProject(newProject);
            this.projects.assignTaskToAgent(task.id, RESEARCH_MANAGER_USER_ID);

            // Reply to the user with the generated response
            await this.reply(params.userPost, {
                message: responseMessage
            });
        } catch (error) {
            Logger.error('Error kicking off project:', error);
            await this.reply(params.userPost, {
                message: 'Failed to kickoff the project. Please try again later.'
            });
        }
    }

    @HandleActivity(ProjectManagerActivities.KickoffContentDevelopment, "Kickoff a content development project", ResponseType.RESPONSE)
    private async kickoffContentDevelopment(params: HandlerParams) {
        const instructions = `
            Create a new project with a task for the content team based on user's request.
            Respond in JSON format with three keys:
            - "projectName": The name of the project
            - "projectGoal": The goal of the project
            - "taskDescription": A detailed description of the task for the content team
            - "responseMessage": A user-friendly response message to inform the user about the new project and assigned task
        `;

        // Create a structured prompt
        const structuredPrompt = new StructuredOutputPrompt(
            {
                type: 'object',
                properties: {
                    projectName: { type: 'string' },
                    projectGoal: { type: 'string' },
                    taskDescription: { type: 'string' },
                    responseMessage: { type: 'string' }
                }
            },
            instructions
        );

        try {
            // Send the structured request to LMStudioService
            const responseJSON = await this.lmStudioService.generateStructured(params.userPost, structuredPrompt, params.threadPosts);

            // Extract projectName, taskDescription, and responseMessage from the response
            const { projectName, projectGoal, taskDescription, responseMessage } = responseJSON;

            // Create a new project with a task for the content team
            const projectId = randomUUID();
            const task: Task = {
                id: randomUUID(),
                description: taskDescription,
                contentBlockId: undefined,
                creator: this.userId,
                projectId: projectId,
                type: ContentManagerActivityType.ConfirmCreateFullContent,
                complete: false
            };

            // Add the project and task to the projects manager
            const newProject: PlanningProject = {
                id: projectId,
                name: projectName,
                goal: projectGoal,
                tasks: { [task.id]: task },
                originalPostId: params.userPost.id,
                description: 'A project initiated by Mesa with a task for the content team.'
            };

            this.projects.addProject(newProject);
            this.projects.assignTaskToAgent(task.id, CONTENT_MANAGER_USER_ID);

            // Reply to the user with the generated response
            await this.reply(params.userPost, {
                message: responseMessage
            });
        } catch (error) {
            Logger.error('Error kicking off content development project:', error);
            await this.reply(params.userPost, {
                message: 'Failed to kickoff the content development project. Please try again later.'
            });
        }
    }

}   