import { Project, TaskManager } from "src/tools/taskManager";
import { ChatClient } from 'src/chat/chatClient';
import LMStudioService from 'src/llm/lmstudioService';
import { PROJECTS_CHANNEL_ID } from 'src/helpers/config';
import { Task } from "src/tools/taskManager";
import ChromaDBService from 'src/llm/chromaService';
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

    constructor(params: AgentConstructorParams) {
        super(params);
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
        
        this.setupChatMonitor(PROJECTS_CHANNEL_ID, params.messagingHandle);
        
        // Register executors
        this.registerStepExecutor(new BrainstormExecutor(params.llmService));
        this.registerStepExecutor(new GenerateArtifactExecutor(params.llmService, this.artifactManager));
        this.registerStepExecutor(new GoalConfirmationExecutor(params.llmService, params.userId));
        this.registerStepExecutor(new AnswerQuestionsExecutor(params.llmService, params.taskManager));
        this.registerStepExecutor(new ComplexProjectExecutor(params.llmService, params.taskManager));
        this.registerStepExecutor(new ScheduleTaskExecutor(params.llmService, params.taskManager));
    }

}   
