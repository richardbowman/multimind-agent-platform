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
import templates from '../templates/documentTemplates.json';
import { TemplateSelectorExecutor } from './executors/TemplateSelectorExecutor';
import { ExecutorType } from './interfaces/ExecutorType';
import { DelegationExecutor } from './executors/DelegationExecutor';
import { EstablishIntentExecutor } from './executors/IntentExecutor';
import { NextActionExecutor } from './executors/NextActionExecutor';
import { ListTemplatesExecutor } from './executors/ListTemplatesExecutor';
import { GoalProgressExecutor } from './executors/GoalProgressExecutor';



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

    private templates: DocumentTemplate[] = [];

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

    constructor(params: AgentConstructorParams) {
        super(params);
        this.planner = null;

        this.modelHelpers.setPurpose(`You are an Onboarding Agent focused on helping users achieve their goals with this platform called Multimind. The service is designed
to help individuals and businesses automate tasks. It provides Web-based research and content creation agents. Your goal is to ensure that the rest of the agents in the platform
are trained and educated on what the user would like to achieve with the platform. You should build an understanding of their goals and desired approach. 
When you gather a sufficient profile to understand how our other agents should support the user, you should build a comprehensive guide documenting your Q&A.

Goals Understanding:
- How they hope to use MutliMind and how the agents can help them and their desired outcomes
`);
// Define sequences for different scenarios
const selectTemplateSequence = [
    { 
        type: ExecutorType.ESTABLISH_INTENT,
        description: "Establish your own intentions for what you would like to accomplish"
    },
    { 
        type: ExecutorType.LIST_TEMPLATES,
        description: "Understand the template options available"
    },
    { 
        type: ExecutorType.UNDERSTAND_GOALS,
        description: "Understand the user's business goals and requirements"
    },
    { 
        type: ExecutorType.ANSWER_QUESTIONS,
        description: "Interpret answers provided"
    },
    {
    type: ExecutorType.SELECT_TEMPLATE,
        description: "Select appropriate document template based on user goals"
    },
    {
        type: ExecutorType.GOAL_PROGRESS,
        description: "Mark channel goal complete"
    },
    { 
        type: ExecutorType.ESTABLISH_INTENT,
        description: "Once completing this sequence, re-esablish a new intention."
    },
];


const createChannelSequence = [
    { 
        type: ExecutorType.ESTABLISH_INTENT,
        description: "Establish your own intentions for what you would like to accomplish"
    },
    {
        type: ExecutorType.CREATE_PLAN,
        description: "Create a comprehensive guide for agents based on user goals"
    },
    { 
        type: ExecutorType.CREATE_CHANNEL,
        description: "Understand the user's business goals and requirements"
    }
];

this.modelHelpers.addStepSequence(
    'template-selection-flow',
    'Standard sequence for new users needing an onboarding template',
    selectTemplateSequence
);

this.modelHelpers.addStepSequence(
    'create-channel-flow',
    'Once you have generated their plan, setup a channel for agents to begin working',
    createChannelSequence
)

this.modelHelpers.setFinalInstructions(`Use the appropriate sequence based on user context:
- For new users: Follow the new-user sequence to understand their goals
- For existing users: Use the followup sequence to continue their onboarding`);

        // Register our specialized executors
        this.registerStepExecutor(new EstablishIntentExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new UnderstandGoalsExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new AnswerQuestionsExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new CreatePlanExecutor(this.getExecutorParams(), this));
        // this.registerStepExecutor(new ReviewProgressExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new CreateChannelExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ListTemplatesExecutor(this.getExecutorParams(), this));
        this.registerStepExecutor(new TemplateSelectorExecutor(this.getExecutorParams(), this));
        this.registerStepExecutor(new DelegationExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new GoalProgressExecutor(this.getExecutorParams()));
        // this.registerStepExecutor(new ValidationExecutor(this.getExecutorParams()));

        this.registerStepExecutor(new NextActionExecutor(this.getExecutorParams(), this.stepExecutors));


        }
}
