import { StepBasedAgent } from './stepBasedAgent';
import 'reflect-metadata';
import { ONBOARDING_CHANNEL_ID } from '../helpers/config';
import Logger from '../helpers/logger';
import { Project, Task } from '../tools/taskManager';
import { Artifact } from 'src/tools/artifact';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { AnswerQuestionsExecutor } from './executors/AnswerQuestionsExecutor';
import { CreatePlanExecutor } from './executors/CreatePlanExecutor';
import { ReviewProgressExecutor } from './executors/ReviewProgressExecutor';
import { OnboardingGoalsExecutor } from './executors/UnderstandGoalsExecutor';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';



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

export class OnboardingConsultant extends StepBasedAgent<OnboardingProject, Task> {

    public async initialize(): Promise<void> {
        Logger.info(`Initialized Onboarding Consultant`);
        await super.setupChatMonitor(ONBOARDING_CHANNEL_ID, "@onboarding");

        // Check if welcome message exists in channel
        const channelMessages = await this.chatClient.fetchPreviousMessages(ONBOARDING_CHANNEL_ID, 50);
        const existingWelcome = channelMessages.find(c => c.props.messageType === 'welcome');

        if (!existingWelcome) {
            const welcomeMessage = {
                message: `👋 Welcome! I'm your Goal-Based Onboarding Consultant.
                
I help you achieve your business objectives by:
- Understanding your specific goals
- Creating actionable plans
- Tracking progress
- Adapting strategies as needed

Let's start by discussing your main business goals. What would you like to achieve?`,
                props: { messageType: 'welcome' }
            };

            await this.send(welcomeMessage, ONBOARDING_CHANNEL_ID);
        }
        
        // asynchronously check for old tasks and keep working on them
        this.processTaskQueue();
    }


    constructor(params: AgentConstructorParams) {
        super(params);
        
        // Register our specialized executors
        // this.registerStepExecutor(new ReplyExecutor(lmStudioService, projects, this.artifactManager));
        this.registerStepExecutor(new AnswerQuestionsExecutor(params.llmService, params.taskManager));
        this.registerStepExecutor(new OnboardingGoalsExecutor(params.llmService, params.taskManager, params.userId));
        this.registerStepExecutor(new CreatePlanExecutor(params.llmService, params.taskManager, this.artifactManager, params.userId));
        this.registerStepExecutor(new ReviewProgressExecutor(params.llmService, params.taskManager, this.artifactManager));
        this.registerStepExecutor(new ValidationExecutor(params.llmService));

        this.modelHelpers.setPurpose(`You are an Onboarding Agent focused on helping users achieve their business goals with our AI Agent tools. This service is designed
to help businesses automate tasks automatically including research and content creation. My goal is to ensure that the rest of the agents in the platform
are trained and educated on what the user is trying to achieve using our system. This means I build an understanding of their business goals, market, strategy,
    and brand standards. When all of that is complete, I build and maintain a comprehensive on-boarding guide, and then introduce the user to the other agents.`);
this.modelHelpers.setFinalInstructions(`To kickoff with a new user, create the following steps in this order:
1. understand_goals
2. validation
3. create_revise_plan
`);
        }
}
