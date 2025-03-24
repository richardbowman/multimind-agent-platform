import { StepBasedAgent } from './stepBasedAgent';
import 'reflect-metadata';
import Logger from '../helpers/logger';
import { Project } from '../tools/taskManager';
import { Artifact, ArtifactItem } from 'src/tools/artifact';
import { AnswerQuestionsExecutor } from './executors/AnswerQuestionsExecutor';
import { CreatePlanExecutor } from './executors/CreatePlanExecutor';
import { UnderstandGoalsExecutor } from './executors/UnderstandGoalsExecutor';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { CreateChannelExecutor } from './executors/CreateChannelExecutor';
import { TemplateSelectorExecutor } from './executors/TemplateSelectorExecutor';
import { DelegationExecutor } from './executors/DelegationExecutor';
import { EstablishIntentExecutor } from './executors/IntentExecutor';
import { NextActionExecutor } from './executors/NextActionExecutor';
import { ListTemplatesExecutor } from './executors/ListTemplatesExecutor';
import { GoalProgressExecutor } from './executors/GoalProgressExecutor';
import { GenerateDocumentExecutor } from './executors/GenerateDocumentExecutor';
import { ExecutorConstructorParams } from './interfaces/ExecutorConstructorParams';



export interface QuestionAnswer {
    questionId: string;
    question: string;
    answer: string;
    analysis: string;
    answeredAt: string;
}

export interface OnboardingProject extends Project {
    businessDescription?: string;
    businessGoals?: string[];
    serviceRequirements?: string;
    existingPlan?: Artifact;
    answers?: QuestionAnswer[];
    template?: ArtifactItem;
    documentDraft?: string; // Current state of the document
}

export class OnboardingConsultant extends StepBasedAgent {
    constructor(params: AgentConstructorParams) {
        super(params);
        this.agentName 
        this.planner = null;

        this.modelHelpers.setPurpose(`You are an Onboarding Agent focused on helping users achieve their goals with this platform called Multimind. The service is designed
to help individuals and businesses automate tasks. It provides Web-based research and content creation agents. Your goal is to ensure that the rest of the agents in the platform
are trained and educated on what the user would like to achieve with the platform. You should build an understanding of their goals and desired approach. 
When you gather a sufficient profile to understand how our other agents should support the user, you should build a comprehensive guide documenting your Q&A.

Goals Understanding:
- How they hope to use MutliMind and how the agents can help them and their desired outcomes
`);

this.modelHelpers.setFinalInstructions(`Use the appropriate sequence based on user context:
- For new users: Follow the new-user sequence to understand their goals
- For existing users: Use the followup sequence to continue their onboarding`);

        // Register our specialized executors
        this.registerStepExecutor(new EstablishIntentExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new UnderstandGoalsExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new AnswerQuestionsExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new GenerateDocumentExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new CreateChannelExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ListTemplatesExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new TemplateSelectorExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new DelegationExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new GoalProgressExecutor(this.getExecutorParams()));
        // this.registerStepExecutor(new ValidationExecutor(this.getExecutorParams()));

        this.registerStepExecutor(new NextActionExecutor(this.getExecutorParams(), this.stepExecutors));


        }
        
        protected getExecutorParams(): ExecutorConstructorParams {
            return {
                ...super.getExecutorParams(),
                agentName: "OnboardingConsulant"
            }
        }
}
