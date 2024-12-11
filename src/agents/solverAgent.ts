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
        this.registerStepExecutor('thinking', new ThinkingExecutor(lmStudioService, 
            "Develop ideas and reasoning through careful analysis and deep thinking"));
        this.registerStepExecutor('refuting', new RefutingExecutor(lmStudioService,
            "Challenge assumptions and identify potential flaws in the current reasoning"));
        this.registerStepExecutor('validation', new ValidationExecutor(lmStudioService,
            "Verify the solution is complete and addresses all aspects of the problem"));

        this.setPurpose(`You are planning how to solve a complex problem through careful reasoning.
Break down the solution into alternating steps of deep thinking and critical refutation.
Use 'thinking' steps for constructive reasoning and 'refuting' steps to challenge assumptions.

IMPORTANT: Always follow this minimum pattern:
1. Start with a 'thinking' step to develop initial ideas
2. Follow with a 'refuting' step to challenge those ideas
3. End with another 'thinking' step to synthesize and improve based on the refutation

You may add more thinking and refuting steps as needed, but never fewer than these three steps.`)
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
            projectName: params.userPost.message,
            tasks: [{
                type: "reply",
                description: "Initial response to user query."
            }],
            metadata: {
                originalPostId: params.userPost.id
            }
        });

        const plan = await this.planSteps(projectId, params.userPost.message);
        await this.executeNextStep(projectId, params.userPost);
    }

    @HandleActivity("response", "Handle responses on the thread", ResponseType.RESPONSE)
    protected async handleThreadResponse(params: HandlerParams): Promise<void> {
        const project = params.projects?.[0];
        
        // Get conversation history
        const conversationHistory = await this.chatClient.getPostThread(params.userPost.id);
        const conversationContext = conversationHistory
            .map(post => `[${post.user_id === this.userId ? 'Assistant' : 'User'}] ${post.message}`)
            .join('\n\n');

        // If no active project, treat it as a new conversation
        if (!project) {
            Logger.info("No active project found, starting new conversation");
            const { projectId } = await this.addNewProject({
                projectName: params.userPost.message,
                tasks: [{
                    type: "reply",
                    description: "Initial response to user query."
                }],
                metadata: {
                    originalPostId: params.userPost.id
                }
            });

            const plan = await this.planSteps(projectId, params.userPost.message);
            await this.executeNextStep(projectId, params.userPost);
            return;
        }

        // Handle response to existing project
        const currentTask = Object.values(project.tasks).find(t => t.inProgress);
        if (!currentTask) {
            Logger.info("No active task, treating as new query in existing project");
            const plan = await this.planSteps(project.id, params.userPost.message);
            await this.executeNextStep(project.id, params.userPost);
            return;
        }

        // Handle response to active task
        const plan = await this.planSteps(project.id, params.userPost.message);
        await this.executeNextStep(project.id, params.userPost);
    }
    
}
