import { StepBasedAgent, StepResult } from './stepBasedAgent';
import { PlanStepsResponse } from './schemas/agent';
import { ChatClient } from '../chat/chatClient';
import 'reflect-metadata';
import LMStudioService, { StructuredOutputPrompt } from '../llm/lmstudioService';
import { TaskManager } from '../tools/taskManager';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import { ONBOARDING_CHANNEL_ID } from '../helpers/config';
import { ArtifactManager } from '../tools/artifactManager';
import ChromaDBService from '../llm/chromaService';
import Logger from '../helpers/logger';
import { Project, Task } from '../tools/taskManager';
import crypto from 'crypto';
import { Artifact } from 'src/tools/artifact';
import { RequestArtifacts } from './schemas/ModelResponse';
import { definitions as schemas } from "./schemas/schema.json";
import { PlanStepTask } from './schemas/agent';
import { StepExecutor } from './decorators/executorDecorator';
import { RefutingExecutor } from './executors/RefutingExecutor';
import { ThinkingExecutor } from './executors/ThinkingExecutor';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { AnalyzeGoalsExecutor } from './executors/AnalyzeGoalsExecutor';
import { AnswerQuestionsExecutor } from './executors/AnswerQuestionsExecutor';
import { CreatePlanExecutor } from './executors/CreatePlanExecutor';
import { ReplyExecutor } from './executors/ReplyExecutor';
import { ReviewProgressExecutor } from './executors/ReviewProgressExecutor';
import { UnderstandGoalsExecutor } from './executors/UnderstandGoalsExecutor';



interface QuestionAnswer {
    questionId: string;
    question: string;
    answer: string;
    analysis: string;
    answeredAt: string;
}

export interface OnboardingProject extends Project<Task> {
    businessDescription?: string;
    businessGoals?: string[];
    serviceRequirements?: string;
    existingPlan?: Artifact;
    answers?: QuestionAnswer[];
}

class GoalBasedOnboardingConsultant extends StepBasedAgent<OnboardingProject, Task> {
    protected projectCompleted(project: OnboardingProject): void {
        // this.chatClient.postInChannel()
    }
    protected processTask(task: Task): Promise<void> {
        throw new Error('Method not implemented.');
    }


    public async initialize(): Promise<void> {
        Logger.info(`Initialized Onboarding Consultant`);
        await super.setupChatMonitor(ONBOARDING_CHANNEL_ID, "@onboarding");

        const welcomeMessage = {
            message: `👋 Welcome! I'm your Goal-Based Onboarding Consultant.
            
I help you achieve your business objectives by:
- Understanding your specific goals
- Creating actionable plans
- Tracking progress
- Adapting strategies as needed

Let's start by discussing your main business goals. What would you like to achieve?`
        };

        await this.send(welcomeMessage, ONBOARDING_CHANNEL_ID);
        
        // asynchronously check for old tasks and keep working on them
        this.processTaskQueue();
    }

    @HandleActivity("start-thread", "Start conversation with user", ResponseType.CHANNEL)
    protected async handleConversation(params: HandlerParams): Promise<void> {
        // Get conversation history
        const conversationContext = [...params.rootPost?[params.rootPost]:[], ...params.threadPosts||[], params.userPost]
            .map(post => `[${post.user_id === this.userId ? 'Assistant' : 'User'}] ${post.message}`)
            .join('\n\n');

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

        const plan = await this.planSteps(projectId, conversationContext);
        await this.executeNextStep(projectId, params.userPost);
    }

    @HandleActivity("response", "Handle responses on the thread", ResponseType.RESPONSE)
    protected async handleThreadResponse(params: HandlerParams): Promise<void> {
        const project = params.projects?.[0] as OnboardingProject;
        
        // Get conversation history
        const conversationContext = [...params.rootPost?[params.rootPost]:[], ...params.threadPosts||[], params.userPost]
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

            const plan = await this.planSteps(projectId, conversationContext);
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
        const plan = await this.planSteps(project.id, conversationContext);
        await this.executeNextStep(project.id, params.userPost);
    }

    constructor(
        chatClient: ChatClient,
        lmStudioService: LMStudioService,
        userId: string,
        projects: TaskManager,
        chromaDBService: ChromaDBService
    ) {
        super(chatClient, lmStudioService, userId, projects, chromaDBService);
        
        // Register our specialized executors
        this.registerStepExecutor(new ReplyExecutor(lmStudioService, projects, this.artifactManager));
        this.registerStepExecutor(new AnswerQuestionsExecutor(lmStudioService, projects));
        this.registerStepExecutor(new UnderstandGoalsExecutor(lmStudioService, projects));
        this.registerStepExecutor(new AnalyzeGoalsExecutor(lmStudioService, projects, this.artifactManager));
        this.registerStepExecutor(new CreatePlanExecutor(lmStudioService, projects, this.artifactManager));
        this.registerStepExecutor(new ReviewProgressExecutor(lmStudioService, projects, this.artifactManager));
        this.registerStepExecutor(new ValidationExecutor(lmStudioService));

        this.setPurpose(`I am an Onboarding Agent focused on helping users achieve their business goals with our AI Agent tools. This service is designed
to help businesses automate tasks automatically including research and content creation. My goal is to ensure that the rest of the agents in the platform
are trained and educated on what the user is trying to achieve using our system. This means I build an understanding of their business goals, market, strategy,
and brand standards. When all of that is complete, I build and maintain a comprehensive on-boarding guide, and then introduce the user to the other agents.`);
    }
}

export default GoalBasedOnboardingConsultant;
