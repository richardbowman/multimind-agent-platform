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
import { RequestArtifacts } from '../schemas/ModelResponse';
import { BrainstormExecutor } from './executors/BrainstormExecutor';
import { GenerateArtifactExecutor } from './executors/GenerateArtifactExecutor';

export enum ProjectManagerActivities {
    AnswerQuestions = "answer-questions",
    GenerateArtifact = "generate-artifact",
    KickoffCombinedProject = "kickoff-complex-project",
    ScheduleTask = "schedule-task"
}

export interface PlanningProject extends Project<Task> {
    originalPostId: string;
    confirmationPostId?: string;
    goal: string;
    description: string;
}

export class ProjectManager extends StepBasedAgent<PlanningProject, Task> {
    protected async projectCompleted(project: PlanningProject): Promise<void> {
        await super.projectCompleted(project);
    }

    constructor(userId: string, messagingHandle: string, chatClient: ChatClient, lmStudioService: LMStudioService, chromaDBService: ChromaDBService, projects: TaskManager) {
        super(chatClient, lmStudioService, userId, projects, chromaDBService);
        this.modelHelpers.setPurpose(`My name is Mesa. My goal is to help develop standardized processes for your business.`)
        this.setupChatMonitor(PROJECTS_CHANNEL_ID, messagingHandle);
        
        // Register executors
        this.registerStepExecutor(new BrainstormExecutor(lmStudioService));
        this.registerStepExecutor(new GenerateArtifactExecutor(lmStudioService, this.artifactManager));
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
                metadata: {
                    originalPostId: params.userPost.id,
                },
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

    @HandleActivity(ProjectManagerActivities.KickoffCombinedProject, "Kickoff a combined project involving both research and content development", ResponseType.RESPONSE)
    private async kickoffComplexProject(params: HandlerParams) {
        const instructions = `
            Create a new project with multiple tasks for both research and content teams based on user's request. Make sure the tasks are
            thoroughly described, independent, and complete.

            Respond in JSON format with these keys:
            - "projectName": The name of the project
            - "projectGoal": The goal of the project
            - "researchTask": What is needed from the research team
            - "contentTask": What is needed from the content team
            - "responseMessage": A user-friendly response message to inform the user about the new project and assigned tasks
        `;

        const structuredPrompt = new StructuredOutputPrompt(
            {
                type: 'object',
                properties: {
                    projectName: { type: 'string' },
                    projectGoal: { type: 'string' },
                    researchTask: { type: 'string' },
                    contentTask: { type: 'string' },
                    responseMessage: { type: 'string' }
                }
            },
            instructions
        );

        try {
            const responseJSON = await this.lmStudioService.generateStructured(params.userPost, structuredPrompt, params.threadPosts);
            const { projectName, projectGoal, researchTask, contentTask, responseMessage } = responseJSON;

            // Create a new project
            const projectId = randomUUID();
            const tasks: Record<string, Task> = {};
            
            // Create research tasks first
            const researchTaskIds: string[] = [];
            let taskId = randomUUID();
            researchTaskIds.push(taskId);
            tasks[taskId] = {
                id: taskId,
                description: `${researchTask} [${projectGoal}]`,
                creator: this.userId,
                projectId: projectId,
                type: ResearchActivityType.WebResearch,
                complete: false
            };

            // Create content tasks that depend on research completion
            taskId = randomUUID();
            tasks[taskId] = {
                id: taskId,
                description: `${contentTask} [${projectGoal}]`,
                creator: this.userId,
                projectId: projectId,
                type: ContentManagerActivityType.ConfirmCreateFullContent,
                complete: false,
                dependsOn: researchTaskIds[0] // Make content tasks depend on first research task
            };

            // Create and add the project
            const newProject: PlanningProject = {
                id: projectId,
                name: projectName,
                goal: projectGoal,
                tasks: tasks,
                metadata: {
                    originalPostId: params.userPost.id,
                },
                description: 'A complex project involving both research and content development.'
            };

            this.projects.addProject(newProject);

            // Now assign tasks to agents after project is created
            for (const taskId of Object.keys(tasks)) {
                const task = tasks[taskId];
                if (task.type === ResearchActivityType.WebResearch) {
                    this.projects.assignTaskToAgent(taskId, RESEARCH_MANAGER_USER_ID);
                } else if (task.type === ContentManagerActivityType.ConfirmCreateFullContent) {
                    this.projects.assignTaskToAgent(taskId, CONTENT_MANAGER_USER_ID);
                }
            }

            await this.reply(params.userPost, {
                message: responseMessage
            }, {
                "project-id": projectId
            });
        } catch (error) {
            Logger.error('Error kicking off complex project:', error);
            await this.reply(params.userPost, {
                message: 'Failed to kickoff the complex project. Please try again later.'
            });
        }
    }

    @HandleActivity(ProjectManagerActivities.ScheduleTask, "Schedule a recurring task", ResponseType.RESPONSE)
    private async scheduleTask(params: HandlerParams) {
        const instructions = `
            Create a new recurring task based on the user's request.
            Respond in JSON format with these keys:
            - "taskDescription": Description of what needs to be done
            - "recurrencePattern": One of "Daily", "Weekly", or "Monthly"
            - "responseMessage": A user-friendly confirmation message
        `;

        const structuredPrompt = new StructuredOutputPrompt(
            {
                type: 'object',
                properties: {
                    taskDescription: { type: 'string' },
                    recurrencePattern: { type: 'string', enum: ['Daily', 'Weekly', 'Monthly'] },
                    responseMessage: { type: 'string' }
                }
            },
            instructions
        );

        try {
            const responseJSON = await this.lmStudioService.generateStructured(params.userPost, structuredPrompt, params.threadPosts);
            const { taskDescription, recurrencePattern, responseMessage } = responseJSON;

            // Create a new project for the recurring task
            const projectId = randomUUID();
            const taskId = randomUUID();

            // Map string pattern to enum
            const pattern = {
                'Daily': RecurrencePattern.Daily,
                'Weekly': RecurrencePattern.Weekly,
                'Monthly': RecurrencePattern.Monthly
            }[recurrencePattern];

            const task: Task = {
                id: taskId,
                description: taskDescription,
                creator: this.userId,
                projectId: projectId,
                isRecurring: true,
                recurrencePattern: pattern,
                lastRunDate: new Date(),
                complete: false
            };

            // Create and add the project
            const newProject: PlanningProject = {
                id: projectId,
                name: `Recurring ${recurrencePattern} Task`,
                goal: `Complete recurring task: ${taskDescription}`,
                tasks: { [taskId]: task },
                metadata: {
                    originalPostId: params.userPost.id,
                },
                description: `A ${recurrencePattern.toLowerCase()} recurring task.`
            };

            await this.projects.addProject(newProject);

            await this.reply(params.userPost, {
                message: responseMessage
            }, {
                "project-id": projectId
            });

        } catch (error) {
            Logger.error('Error scheduling recurring task:', error);
            await this.reply(params.userPost, {
                message: 'Failed to schedule the recurring task. Please try again later.'
            });
        }
    }
}   
