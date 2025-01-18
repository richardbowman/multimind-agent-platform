import { StepBasedAgent } from './stepBasedAgent';
import 'reflect-metadata';
import Logger from '../helpers/logger';
import { Project, Task } from '../tools/taskManager';
import { Artifact } from 'src/tools/artifact';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { AnswerQuestionsExecutor } from './executors/AnswerQuestionsExecutor';
import { CreatePlanExecutor } from './executors/CreatePlanExecutor';
import { ReviewProgressExecutor } from './executors/ReviewProgressExecutor';
import { UnderstandGoalsExecutor } from './executors/UnderstandGoalsExecutor';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { CreateChannelExecutor } from './executors/CreateChannelExecutor';
import templates from '../../templates/documentTemplates.json';
import path from 'path';



export interface QuestionAnswer {
    questionId: string;
    question: string;
    answer: string;
    analysis: string;
    answeredAt: string;
}

export interface DocumentTemplate {
    id: string;
    name: string;
    description: string;
    templateContent: string; // Markdown content with placeholders
    sections: TemplateSection[];
    requiredSections: string[];
}

export interface TemplateSection {
    id: string;
    title: string;
    description: string;
    placeholder: string; // The markdown placeholder text to replace
    questions: string[]; // Questions needed to populate this section
    status: 'empty' | 'draft' | 'complete';
}

export interface OnboardingProject extends Project {
    businessDescription?: string;
    businessGoals?: string[];
    serviceRequirements?: string;
    existingPlan?: Artifact;
    answers?: QuestionAnswer[];
    template?: DocumentTemplate;
    documentDraft?: string; // Current state of the document
}

export class OnboardingConsultant extends StepBasedAgent {

    private templates: DocumentTemplate[];

    public async initialize(): Promise<void> {
        Logger.info(`Initialized Onboarding Consultant`);
        
        // Load templates from JSON file
        this.templates = templates.templates as DocumentTemplate[];
        
        // asynchronously check for old tasks and keep working on them
        this.processTaskQueue();
    }

    public getTemplateById(templateId: string): DocumentTemplate | undefined {
        return this.templates.find(t => t.id === templateId);
    }

    public getAvailableTemplates(): DocumentTemplate[] {
        return this.templates;
    }

    public async setupChatMonitor(monitorChannelId: string, handle?: string, autoRespond?: boolean): Promise<void> {
        super.setupChatMonitor(monitorChannelId, handle, autoRespond);
        // Check if welcome message exists in channel
        const channelMessages = await this.chatClient.fetchPreviousMessages(monitorChannelId, 50);
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

            await this.send(welcomeMessage, monitorChannelId);
        }
    }

    constructor(params: AgentConstructorParams) {
        super(params);
        this.modelHelpers.setPurpose(`You are an Onboarding Agent focused on helping users achieve their business goals with this platform called Multimind. The service is designed
to help individuals and businesses automate tasks. It provides Web-based research and content creation agents. Your goal is to ensure that the rest of the agents in the platform
are trained and educated on what the user would like to achieve with the platform. You should build an understanding of their goals and desired approach. 
When you gather a sufficient profile to understand how our other agents should support the user, you should build a comprehensive on-boarding guide for the individual and agents.

By the end of the process, you should help elicit:

Goals Understanding:
- Their goals for using multimind
- Their desired outcomes
- Their timeline expectations

AI Service Integration:
- Which processes they want to automate
- What type of content or tasks they need help with
- Current workflow and pain points
- Experience level with AI tools
- What success would look like
`);
this.modelHelpers.setFinalInstructions(`To kickoff with a new user, create the following steps in this order:
1. understand_goals
2. create_revise_plan

For an existing user who has answered sufficient questions, move on to create_revise_plan.
`);

        // Register our specialized executors
        this.registerStepExecutor(new UnderstandGoalsExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new AnswerQuestionsExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new CreatePlanExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ReviewProgressExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new CreateChannelExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new TemplateSelectorExecutor(this.getExecutorParams()));
        // this.registerStepExecutor(new ValidationExecutor(this.getExecutorParams()));


        }
}
