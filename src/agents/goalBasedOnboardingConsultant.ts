import { StepBasedAgent } from './stepBasedAgent';
import { ChatClient } from '../chat/chatClient';
import 'reflect-metadata';
import LMStudioService from '../llm/lmstudioService';
import { TaskManager } from '../tools/taskManager';
import { HandleActivity, HandlerParams, ResponseType } from './agents';
import { ONBOARDING_CHANNEL_ID } from '../helpers/config';
import ChromaDBService from '../llm/chromaService';
import Logger from '../helpers/logger';
import { Project, Task } from '../tools/taskManager';
import { Artifact } from 'src/tools/artifact';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { AnswerQuestionsExecutor } from './executors/AnswerQuestionsExecutor';
import { CreatePlanExecutor } from './executors/CreatePlanExecutor';
import { ReviewProgressExecutor } from './executors/ReviewProgressExecutor';
import { UnderstandGoalsExecutor } from './executors/UnderstandGoalsExecutor';



export interface QuestionAnswer {
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


    constructor(params: AgentConstructorParams) {
        super(params);
        
        // Register our specialized executors
        // this.registerStepExecutor(new ReplyExecutor(lmStudioService, projects, this.artifactManager));
        this.registerStepExecutor(new AnswerQuestionsExecutor(lmStudioService, projects));
        this.registerStepExecutor(new UnderstandGoalsExecutor(lmStudioService, projects, userId));
        // this.registerStepExecutor(new AnalyzeGoalsExecutor(lmStudioService, projects, this.artifactManager, userId));
        this.registerStepExecutor(new CreatePlanExecutor(lmStudioService, projects, this.artifactManager, userId));
        this.registerStepExecutor(new ReviewProgressExecutor(lmStudioService, projects, this.artifactManager));
        this.registerStepExecutor(new ValidationExecutor(lmStudioService));

        this.modelHelpers.setFinalInstructions(`This means I build an understanding of their business goals, market, strategy,
and brand standards. When all of that is complete, I build and maintain a comprehensive on-boarding guide, and then introduce the user to the other agents.`);
        this.modelHelpers.setPurpose(`I am an Onboarding Agent focused on helping users achieve their business goals with our AI Agent tools. This service is designed
to help businesses automate tasks automatically including research and content creation. My goal is to ensure that the rest of the agents in the platform
are trained and educated on what the user is trying to achieve using our system.`);
    }
}

export default GoalBasedOnboardingConsultant;
