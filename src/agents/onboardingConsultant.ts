import { randomUUID } from 'crypto';
import Logger from '../helpers/logger';
import { Agent, HandleActivity, HandlerParams, ProjectHandlerParams, ResponseType } from './agents';
import { Project, TaskManager } from "src/tools/taskManager";
import { ChatClient, ChatPost, ProjectChainResponse } from 'src/chat/chatClient';
import LMStudioService, { StructuredOutputPrompt } from 'src/llm/lmstudioService';
import { ONBOARDING_CHANNEL_ID } from 'src/helpers/config';
import { Task } from "src/tools/taskManager";
import { ArtifactManager } from 'src/tools/artifactManager';
import { Artifact } from 'src/tools/artifact';
import ChromaDBService from 'src/llm/chromaService';

export enum OnboardingActivities {
    UnderstandBusiness = "understand-business",
    UnderstandGoals = "understand-goals",
    DevelopStrategy = "develop-strategy",
    SetExpectations = "set-expectations"
}

export interface OnboardingTask extends Task {
    activity: OnboardingActivities;
}

export interface OnboardingProject extends Project<OnboardingTask> {
    businessDescription?: string;
    businessGoals?: string[];
    serviceRequirements?: string;   
}

export class OnboardingConsultant extends Agent<OnboardingProject, Task> {
    private artifactManager: ArtifactManager;

    protected taskNotification(task: Task): void {
        throw new Error('Method not implemented.');
    }

    protected async projectCompleted(project: OnboardingProject): Promise<void> {
        await this.send({ message: `Your onboarding process is now complete. Thank you for your cooperation!` }, ONBOARDING_CHANNEL_ID);
    }

    constructor(userId: string, messagingHandle: string, chatClient: ChatClient, lmStudioService: LMStudioService, chromaDBService: ChromaDBService, projects: TaskManager) {
        super(chatClient, lmStudioService, userId, projects, chromaDBService);
        this.setPurpose(`My name is Onboarding Consultant. My goal is to help you understand the service and how it can benefit your business.`);
        this.setupChatMonitor(ONBOARDING_CHANNEL_ID, messagingHandle);
        this.artifactManager = new ArtifactManager(this.chromaDBService);
    }

    @HandleActivity("initial-inquiry", "Initial conversation about the user's business", ResponseType.CHANNEL)
    private async startOnboarding(params: HandlerParams) {
        const instructions = `Here are the ways you can help when the user posts in the channel:
${this.getAvailableActions(ResponseType.CHANNEL).map(a => ` - ${a.activityType}: ${a.usage}`).join('\n')}

Here are the ways you can help respond to initial posts:
${this.getAvailableActions(ResponseType.RESPONSE).map(a => ` - ${a.activityType}: ${a.usage}`).join('\n')}

Respond to the user's request, explaining to them the other available options.`;

        const response = await this.generate(instructions, params);

        // Create a new onboarding project
        const projectId = randomUUID();
        const project: OnboardingProject = {
            id: projectId,
            name: "Onboarding Project",
            tasks: {}
        };

        // Create a task for understanding goals
        const taskId = randomUUID();
        const task: Task = {
            id: taskId,
            description: "Understand user's business goals",
            contentBlockId: undefined,
            creator: this.userId,
            projectId: projectId,
            type: OnboardingActivities.UnderstandGoals,
            complete: false
        };

        // Add the new onboarding project
        this.projects.addProject(project);

        // Add the task to the onboarding project
        this.projects.addTask(project, task);

        await this.reply(params.userPost, response, {
            "project-id": projectId,
            "task-id": taskId
        });
    }

    @HandleActivity(OnboardingActivities.UnderstandBusiness, "Understand the user's business", ResponseType.RESPONSE)
    private async understandBusiness(params: ProjectHandlerParams) {
        const instructions = `
            Understand the user's specific business goals.
            Respond with a list of the gathered business goals.
        `;

        const response = await this.generate(instructions, params);
        await this.reply(params.userPost, response);

        // Update the project with the business description
        const updatedProject: OnboardingProject = {
            ...params.projects?.[0],
            businessDescription: response.message
        };

        // Save the updated project
        this.projects.replaceProject(updatedProject);

        // Create a task for developing strategy
        const taskId = randomUUID();
        const task: Task = {
            id: taskId,
            description: "Develop strategy based on business goals",
            contentBlockId: undefined,
            creator: this.userId,
            projectId: updatedProject.id,
            type: OnboardingActivities.DevelopStrategy,
            complete: false
        };

        // Add the task to the project
        this.projects.addTask(updatedProject, task);
    }

    @HandleActivity(OnboardingActivities.UnderstandGoals, "Understand the user's business goals", ResponseType.RESPONSE)
    private async understandBusinessGoals(params: ProjectHandlerParams) {
        const instructions = `
            Understand the user's specific business goals.
            Respond with a list of the gathered business goals.
        `;

        const response = await this.generate(instructions, params);
        await this.reply(params.userPost, response);

        // Update the project with the business goals
        const updatedProject: OnboardingProject = {
            ...params.projects?.[0],
            businessGoals: response.message.split('\n').map(goal => goal.trim())
        };

        // Save the updated project
        this.projects.replaceProject(updatedProject);

        // Create a task for developing strategy
        const taskId = randomUUID();
        const task: Task = {
            id: taskId,
            description: "Develop strategy based on business goals",
            contentBlockId: undefined,
            creator: this.userId,
            projectId: updatedProject.id,
            type: OnboardingActivities.DevelopStrategy,
            complete: false
        };

        // Add the task to the project
        this.projects.addTask(updatedProject, task);
    }

    @HandleActivity(OnboardingActivities.DevelopStrategy, "Develop strategy based on business goals", ResponseType.RESPONSE)
    private async developStrategy(params: ProjectHandlerParams) {
        const instructions = `
            Develop a strategy that aligns with the user's business goals and how the service can help.
            Respond with a detailed strategy document.
        `;

        // Create a structured prompt
        const structuredPrompt = new StructuredOutputPrompt(
            {
                type: 'object',
                properties: {
                    title: { type: 'string' },
                    content: { type: 'string' }
                }
            },
            instructions
        );

        try {
            // Send the structured request to LMStudioService
            const responseJSON = await this.lmStudioService.generateStructured(params.userPost, structuredPrompt, params.threadPosts);

            // Extract title and content from the response
            const { title, content } = responseJSON;

            // Prepare the artifact
            const artifact: Artifact = {
                id: randomUUID(),
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
                message: `Your strategy document titled "${title}" has been generated and saved. You can find it under ID: ${artifact.id}`,
                artifactIds: [artifact.id]
            });

            // Create a task for setting expectations
            const taskId = randomUUID();
            const task: Task = {
                id: taskId,
                description: "Set service expectations and requirements",
                contentBlockId: undefined,
                creator: this.userId,
                projectId: params.projects[0].id,
                type: OnboardingActivities.SetExpectations,
                complete: false
            };

            // Add the task to the project
            this.projects.addTask(params.projects[0], task);
        } catch (error) {
            Logger.error('Error developing strategy:', error);
            await this.reply(params.userPost, {
                message: 'Failed to develop the strategy. Please try again later.'
            });
        }
    }

    @HandleActivity(OnboardingActivities.SetExpectations, "Set service expectations and requirements", ResponseType.RESPONSE)
    private async setServiceExpectations(params: HandlerParams) {
        const instructions = `
            Gather and document user's expectations and requirements from the service.
            Respond with a summary of the gathered expectations and requirements.
        `;

        const response = await this.generate(instructions, params);
        await this.reply(params.userPost, response);

        // Update the project with the service requirements
        const updatedProject: OnboardingProject = {
            ...params.projects?.[0],
            serviceRequirements: response.message
        };

        // Save the updated project
        this.projects.replaceProject(updatedProject);
    }

    @HandleActivity("check-status", "Check the status of outstanding tasks", ResponseType.RESPONSE)
    private async checkStatus(params: ProjectHandlerParams) {
        const project = params.projects?.[0];

        if (!project) {
            await this.reply(params.userPost, { message: `No project found. Please start a new onboarding process or provide the correct thread ID.` });
            return;
        }

        const projectId = project.id;

        // Get all tasks for the project
        const tasks = project.tasks;
        let statusMessage = `Status of your onboarding project (ID: ${project.id}):\n`;

        for (const task of Object.values(tasks)) {
            statusMessage += `- Task: ${task.description}\n  Status: ${task.complete ? 'Completed' : 'Pending'}\n`;
        }

        await this.reply(params.userPost, { message: statusMessage });
    }

    // @HandleActivity("mark-complete", "Mark a specific task as complete", ResponseType.RESPONSE)
    // private async markComplete(params: HandlerParams) {
    //     const project = params.projects?.[0];

    //     if (!project) {
    //         await this.reply(params.userPost, { message: `No project found. Please start a new onboarding process or provide the correct thread ID.` });
    //         return;
    //     }

    //     const projectId = project.id;

    //     // Mark the task as complete
    //     task.complete = true;
    //     this.projects.updateTask(task);

    //     await this.reply(params.userPost, { message: `Task "${task.description}" has been marked as complete.` });

    //     // Check if all tasks are complete to finalize the project
    //     const allTasksCompleted = this.projects.getAllTasksForProject(task.projectId).every(t => t.complete);
    //     if (allTasksCompleted) {
    //         task.complete = true;
    //         this.projects.updateTask(task);
    //         await this.replyToChannel({ message: `Your onboarding process is now complete. Thank you for your cooperation!` }, ONBOARDING_CHANNEL_ID);
    //     }
    // }
}