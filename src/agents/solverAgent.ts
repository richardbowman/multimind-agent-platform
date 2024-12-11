import { StepBasedAgent } from './stepBasedAgent';
import { ChatClient, ChatPost } from '../chat/chatClient';
import LMStudioService from '../llm/lmstudioService';
import { TaskManager } from '../tools/taskManager';
import { ThinkingExecutor } from './executors/ThinkingExecutor';
import { RefutingExecutor } from './executors/RefutingExecutor';
import { PlanStepsResponse } from './schemas/agent';
import { StructuredOutputPrompt } from '../llm/lmstudioService';
import Logger from 'src/helpers/logger';
import { SOLVER_CHANNEL_ID } from 'src/helpers/config';
import ChromaDBService from 'src/llm/chromaService';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import { ValidationExecutor } from './executors/ValidationExecutor';

export class SolverAgent extends StepBasedAgent<any, any> {
    constructor(
        chatClient: ChatClient,
        lmStudioService: LMStudioService,
        userId: string,
        projects: TaskManager,
        chromaDBService: ChromaDBService
    ) {
        super(chatClient, lmStudioService, userId, projects, chromaDBService);

        // Register our specialized executors
        this.registerStepExecutor(new ThinkingExecutor(lmStudioService));
        this.registerStepExecutor(new RefutingExecutor(lmStudioService));
        this.registerStepExecutor(new ValidationExecutor(lmStudioService));

        this.setPurpose(`You are an expert at solving complex problems through careful reasoning.
Use steps of constructive thinking, critical refutation, and validation to develop robust solutions.

Here are two examples of how to approach problems:

Simple Problem Example (choosing lunch):
1. thinking: Consider preferences, dietary restrictions, and available options
2. refuting: Challenge assumptions about time and budget
3. thinking: Refine choice based on the constraints identified
4. validate: Confirm the choice meets all requirements and constraints

Complex Problem Example (designing a new product):
1. thinking: Analyze market needs and technical requirements
2. refuting: Identify potential failure modes and competition
3. thinking: Develop initial design approach
4. validate: Verify approach against requirements
5. refuting: Challenge design assumptions and identify risks
6. thinking: Refine design based on risk analysis
7. refuting: Test edge cases and user scenarios
8. thinking: Finalize design with mitigations
9. validate: Comprehensive verification of final design

Adapt your approach to the complexity of each problem, using more cycles as needed.
Always include validation steps to verify solutions meet requirements.`)
    }

    public async initialize(): Promise<void> {
        Logger.info(`Initialized Solver Assistant`);
        await super.setupChatMonitor(SOLVER_CHANNEL_ID, "@solver");

        // asynchronously check for old tasks and keep working on them
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
