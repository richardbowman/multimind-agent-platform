import { StepBasedAgent } from './stepBasedAgent';
import { ChatClient } from '../chat/chatClient';
import LMStudioService from '../llm/lmstudioService';
import { TaskManager } from '../tools/taskManager';
import { ThinkingExecutor } from './executors/ThinkingExecutor';
import { RefutingExecutor } from './executors/RefutingExecutor';
import Logger from 'src/helpers/logger';
import { SOLVER_CHANNEL_ID } from 'src/helpers/config';
import ChromaDBService from 'src/llm/chromaService';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { ResearchExecutor } from './executors/ResearchExecutor';
import { GoalConfirmationExecutor } from './executors/GoalConfirmationExecutor';
import { DefaultPlanner } from './planners/DefaultPlanner';
import { ModelHelpers } from 'src/llm/helpers';
import { FinalResponseExecutor } from './executors/FinalResponseExecutor';

export class SolverAgent extends StepBasedAgent<any, any> {
    constructor(
        chatClient: ChatClient,
        lmStudioService: LMStudioService,
        userId: string,
        projects: TaskManager,
        chromaDBService: ChromaDBService
    ) {

        const modelHelpers = new ModelHelpers(lmStudioService, userId);
        modelHelpers.setPurpose(`You are an expert at solving complex problems through careful reasoning.`);
        modelHelpers.setFinalInstructions(`SOLVING INSTRUCTIONS
        Use steps of constructive thinking, critical refutation, and validation to develop robust solutions. In the reasoning field, explain the complexity you see in this goal.
        
        AT A MINIMUM, YOU MUST always perform these 6 steps in order:
        1. goal_confirmation (to ensure clear understanding)
        2. check-knowledge (to learn from existing knowledge)
        3. thinking (to develop initial approach)
        4. refuting (to challenge assumptions)
        5. thinking (to refine based on challenges)
        6. validation (to verify the solution)
        
        Adapt your approach to the complexity of each problem, using more cycles as needed.`);
        const planner = new DefaultPlanner(lmStudioService, projects, userId, modelHelpers);

        super(chatClient, lmStudioService, userId, projects, chromaDBService, planner);

        // Register our specialized executors
        this.registerStepExecutor(new GoalConfirmationExecutor(lmStudioService, userId));
        this.registerStepExecutor(new ThinkingExecutor(lmStudioService));
        this.registerStepExecutor(new RefutingExecutor(lmStudioService));
        this.registerStepExecutor(new ValidationExecutor(lmStudioService));
        this.registerStepExecutor(new ResearchExecutor(lmStudioService, chromaDBService));
        this.registerStepExecutor(new FinalResponseExecutor(modelHelpers));

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
        const project = params.projects?.[0];

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
