import Logger from '../helpers/logger';
import { Agent, HandleActivity, HandlerParams, ProjectHandlerParams, ResponseType } from './agents';
import { Project, TaskManager } from "src/tools/taskManager";
import { ChatClient } from 'src/chat/chatClient';
import LMStudioService, { StructuredOutputPrompt } from 'src/llm/lmstudioService';
import { ONBOARDING_CHANNEL_ID } from 'src/helpers/config';
import { Task } from "src/tools/taskManager";
import { ArtifactManager } from 'src/tools/artifactManager';
import ChromaDBService from 'src/llm/chromaService';
import { StructuredInputPrompt, TaskInputPrompt } from 'src/prompts/structuredInputPrompt';
import schemas from './schemas/schema.json';
import { OnboardingConsultantResponse } from './schemas/onboarding';
import { ModelResponse } from './schemas/ModelResponse';

export enum OnboardingActivities {
    Welcome = "welcome",
    UnderstandGoals = "understand-business-goals",
    SaveGoals = "save-business-goals",
    UnderstandService = "understand-service-usage",
    SaveRequirements = "save-service-requirements",
    ReviewDocuments = "review-documents"
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

    protected processTask(task: Task): Promise<void> {
        throw new Error('Method not implemented.');
    }


    protected async projectCompleted(project: OnboardingProject): Promise<void> {
        const taskList = Object.values(project.tasks);
        const onboardingTask = taskList.find(task => 
            task.type === OnboardingActivities.UnderstandGoals
        );
        const instructions = `The user's onboarding process is now complete. Included is a list of tasks
you worked on together which you can summarize with the user, and then encourage them to reach out to the @pm in #projects!`
        if (onboardingTask?.complete) {
            const response = await this.generate({ instructions: new TaskInputPrompt(instructions, taskList) });
            await this.send({ message: response.message }, ONBOARDING_CHANNEL_ID);
        }
    }

    constructor(userId: string, messagingHandle: string, chatClient: ChatClient, lmStudioService: LMStudioService, chromaDBService: ChromaDBService, projects: TaskManager) {
        super(chatClient, lmStudioService, userId, projects, chromaDBService);
        this.setPurpose(`My name is Onboarding Consultant. My goal is to help you understand the service and how it can benefit your business.`);
        this.setupChatMonitor(ONBOARDING_CHANNEL_ID, messagingHandle);
        this.artifactManager = new ArtifactManager(this.chromaDBService);
    }

    public async initialize(): Promise<void> {
        // Find any existing onboarding projects
        const allProjects = Object.values(this.projects.getProjects());
        const welcomeTask = Object.values(allProjects)
            .flatMap(project => Object.values(project.tasks||[]))
            .find(task => 
                task.type === OnboardingActivities.Welcome
            );

        if (!welcomeTask || !welcomeTask.complete) {
            const welcomeMessage = {
                message: `👋 Welcome! I'm your Onboarding Consultant, and I'm here to help you understand our service and how it can benefit your business.

I can help you with:
- Understanding your business goals
- Creating a customized strategy
- Setting up your service requirements
- Documenting your needs

Feel free to start by telling me about your business, or type "help" to see all available commands.`
            };

            await this.send(welcomeMessage, ONBOARDING_CHANNEL_ID);

            // If no welcome task exists, create a new project with the welcome task
            if (!welcomeTask) {
                const { projectId, taskIds } = await this.addNewProject({
                    projectName: "Initial Onboarding",
                    tasks: [{
                        description: "Initial welcome and user engagement",
                        type: OnboardingActivities.Welcome
                    }]
                });

                // Mark the welcome task as complete
                if (taskIds.length > 0) {
                    await this.projects.completeTask(taskIds[0]);
                }
            } else {
                // If task exists but wasn't complete, mark it complete
                await this.projects.completeTask(welcomeTask.id);
            }
        }
    }

    @HandleActivity("initial-inquiry", "Kickoff conversation about the user's business", ResponseType.CHANNEL)
    private async startOnboarding(params: HandlerParams) {
        const instructions = `Here are the ways you can help when the user posts in the channel:
${this.getAvailableActions(ResponseType.CHANNEL).map(a => ` - ${a.activityType}: ${a.usage}`).join('\n')}

Here are the ways you can help respond to initial posts:
${this.getAvailableActions(ResponseType.RESPONSE).map(a => ` - ${a.activityType}: ${a.usage}`).join('\n')}

Respond to the user's request, explaining to them the other available options.`;

        const response = await this.generateOld(instructions, params);

        // Adding a new project
        const { projectId, taskIds } = await this.addNewProject({
            projectName: "New Onboarding Project",
            tasks: [{
                description: "Understand user's business goals",
                type: OnboardingActivities.UnderstandGoals
            }]
        });

        await this.reply(params.userPost, response, {
            "project-id": projectId,
            "task-id": taskIds[0]
        });
    }

    @HandleActivity(OnboardingActivities.UnderstandGoals, "Ask questions to refine the user's business goals", ResponseType.RESPONSE)
    private async understandBusiness(params: ProjectHandlerParams) {
        const instructions = `
            Understand the user's specific business goals. Ask questions to refine the business plan.
            When you think the plan is done, ask the user if they want to have you create a document.

            Response in the format { message : "Your message here" }
        `;

        // Generate the response
        const response: ModelResponse = await this.generateStructured(new StructuredOutputPrompt(
            schemas.definitions.ModelResponse,
            instructions
        ), params);

        // Reply to the user with confirmation message and artifact details
        await this.reply(params.userPost, {
            message: response.message
        });

        this.addTaskToProject({
            projectId: params.projects[0].id,
            description: "Develop strategy based on business goals",
            type: OnboardingActivities.UnderstandService
        });
    }

    @HandleActivity(OnboardingActivities.SaveGoals, "Create a document representing a completed business goal document.", ResponseType.RESPONSE)
    private async understandBusinessGoals(params: ProjectHandlerParams) {
        const response = await this.generateArtifactResponse(
            `Create a document representing business goals. The document's sections to write are:
            - Company Overview
            - Mission and Vision
            - Key Business Goals
            - Action Plans
            - Metrics and KPIs
            - Timeline
            If you feel some sections need more work, explain areas where you'd like to improve`,
            params
        );

        this.addTaskToProject({
            projectId: params.projects[0].id,
            description: "Develop strategy based on business goals",
            type: OnboardingActivities.UnderstandService,
        });

        // Reply to the user with confirmation message and artifact details
        await this.reply(params.userPost, response);
    }

    @HandleActivity(OnboardingActivities.UnderstandService, "After finishing a business plan, work with user on how our agents can help solve them.", ResponseType.RESPONSE)
    private async developStrategy(params: ProjectHandlerParams) {
        const response = await this.generateArtifactResponse(
            "Develop a strategy that aligns with the user's business goals and how the service can help. Our @research Reserrch Manager agent can do web research, and our @content Content Manager can help write various kinds of content like blog posts, marketing plans, etc.",
            params
        );
        
        // Reply to the user with confirmation message and artifact details
        await this.reply(params.userPost, response);

        // Create a task for setting expectations
        this.addTaskToProject({
            projectId: params.projects[0].id,
            description: "Set service expectations and requirements",
            type: OnboardingActivities.SaveRequirements,
        });
    }

    @HandleActivity(OnboardingActivities.SaveRequirements, "Save requirements document for how the service should work for this user.", ResponseType.RESPONSE)
    private async setServiceExpectations(params: HandlerParams) {
        const instructions = `
            Gather and document user's expectations and requirements from the service.
            Respond with a summary of the gathered expectations and requirements.
        `;

        const response = await this.generateOld(instructions, params);
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

    @HandleActivity("mark-complete", "Mark a specific task as complete", ResponseType.RESPONSE)
    private async markComplete(params: HandlerParams) {
        const project = params.projects?.[0];

        if (!project) {
            await this.reply(params.userPost, { message: `No project found. Please start a new onboarding process or provide the correct thread ID.` });
            return;
        }

        // Create a structured prompt
        const instructions = `
        Review the list of tasks and identify which ones should be marked as complete based on the context provided.
        Respond with a JSON object containing an array of task IDs to mark as complete and a user-friendly response message.

        Example response: { "completedTasks": ["task-id-1", "task-id-2"], "message": "Task 1 and Task 2 have been marked as complete." }`;

        try {
            // Prepare the input for the LLM
            const tasks = Object.values(project.tasks);
            const taskList = tasks.map(task => ({ id: task.id, description: task.description }));

            const instructionsWithTasks = new TaskInputPrompt(instructions, taskList);

            // Create a structured prompt
            const structuredPrompt = new StructuredOutputPrompt(
                schemas.definitions.OnboardingConsultantResponse,
                instructionsWithTasks.toString()
            );

            // Send the structured request to LMStudioService
            const response: OnboardingConsultantResponse = await this.lmStudioService.generateStructured(params.userPost, structuredPrompt, params.threadPosts);

            // Extract completed task IDs and response message from the response
            const { completedTasks, message } = response;

            // Mark the identified tasks as complete
            for (const taskId of completedTasks) {
                const task = tasks.find(t => t.id === taskId);
                if (task) {
                    await this.projects.completeTask(task.id);
                }
            }

            await this.reply(params.userPost, { message });

        } catch (error) {
            Logger.error('Error marking tasks as complete:', error);
            await this.reply(params.userPost, { message: 'Failed to mark tasks as complete. Please try again later.' });
        }
    }

    @HandleActivity(OnboardingActivities.ReviewDocuments, "Review existing documents and generate outstanding tasks list", ResponseType.RESPONSE)
    private async reviewDocuments(params: ProjectHandlerParams) {
        const instructions = `
        Review the existing documents in the project.
        Identify any missing tasks based on the business goals and strategy development process.
        Respond with a JSON object containing an array of task descriptions for any missing tasks.

        Example response: { "missingTasks": ["Understand user's specific business requirements", "Develop marketing plan"] }
    `;

        try {
            // Generate the response
            const responseJSON = await this.generateOld(instructions, params);

            // Extract missing tasks from the response
            const { missingTasks } = responseJSON;

            if (missingTasks && missingTasks.length > 0) {
                const project = params.projects?.[0];
                if (!project) {
                    await this.reply(params.userPost, { message: `No project found. Please start a new onboarding process or provide the correct thread ID.` });
                    return;
                }

                // Generate tasks for each missing task description
                const newTasks = missingTasks.map(description => ({
                    id: randomUUID(),
                    description: description,
                    contentBlockId: undefined,
                    creator: this.userId,
                    projectId: project.id,
                    type: OnboardingActivities.UnderstandBusiness, // Use a default activity type
                    complete: false
                }));

                // Add the new tasks to the project
                for (const task of newTasks) {
                    this.projects.addTask(project, task);
                }

                await this.reply(params.userPost, {
                    message: `The following missing tasks have been added to your project:
${newTasks.map(task => `- ${task.description}`).join('\n')}
Please proceed with these tasks.` });
            } else {
                await this.reply(params.userPost, { message: `All required tasks are already accounted for in the project. No additional tasks need to be added.` });
            }
        } catch (error) {
            Logger.error('Error reviewing documents:', error);
            await this.reply(params.userPost, { message: 'Failed to review the documents and generate the outstanding tasks list. Please try again later.' });
        }
    }
}