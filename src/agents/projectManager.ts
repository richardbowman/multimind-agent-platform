import { randomUUID } from 'crypto';
import Logger from '../helpers/logger';
import { Agent, HandleActivity, HandlerParams, ResponseType } from './agents';
import { Project, RecurrencePattern, TaskManager } from "src/tools/taskManager";
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
import { GoalConfirmationExecutor } from './executors/GoalConfirmationExecutor';
import { AnswerQuestionsExecutor } from './executors/AnswerQuestionsExecutor';
import { ComplexProjectExecutor } from './executors/ComplexProjectExecutor';
import { ScheduleTaskExecutor } from './executors/ScheduleTaskExecutor';
import { StepBasedAgent } from './stepBasedAgent';

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
    protected processTask(task: Task): Promise<void> {
        throw new Error('Method not implemented.');
    }
    protected async projectCompleted(project: PlanningProject): Promise<void> {
        await super.projectCompleted(project);
    }

    constructor(userId: string, messagingHandle: string, chatClient: ChatClient, lmStudioService: LMStudioService, chromaDBService: ChromaDBService, projects: TaskManager) {
        super(chatClient, lmStudioService, userId, projects, chromaDBService);
        this.modelHelpers.setPurpose(`My name is Mesa. My goal is to help develop standardized processes for your business.`)
        this.modelHelpers.setFinalInstructions(`When planning steps for a project:
1. Start with goal confirmation to ensure clear understanding
2. Break down complex tasks into smaller, manageable steps
3. Consider dependencies between tasks
4. Include validation steps to ensure quality
5. Add brainstorming steps for creative solutions
6. Generate artifacts to document decisions and plans
7. Always end with a clear summary of accomplishments

Prioritize steps in this order:
1. Goal confirmation and requirements gathering
2. Research and analysis if needed
3. Planning and brainstorming
4. Execution steps
5. Documentation and artifact generation
6. Validation and quality checks
7. Final summary and next steps`);
        
        this.setupChatMonitor(PROJECTS_CHANNEL_ID, messagingHandle);
        
        // Register executors
        this.registerStepExecutor(new BrainstormExecutor(lmStudioService));
        this.registerStepExecutor(new GenerateArtifactExecutor(lmStudioService, this.artifactManager));
        this.registerStepExecutor(new GoalConfirmationExecutor(lmStudioService, userId));
        this.registerStepExecutor(new AnswerQuestionsExecutor(lmStudioService, this.projects));
        this.registerStepExecutor(new ComplexProjectExecutor(lmStudioService, this.projects));
        this.registerStepExecutor(new ScheduleTaskExecutor(lmStudioService, this.projects));
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


}   
