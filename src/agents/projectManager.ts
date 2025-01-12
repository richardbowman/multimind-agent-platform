import { Project } from "src/tools/taskManager";
import { Task } from "src/tools/taskManager";
import { BrainstormExecutor } from './executors/BrainstormExecutor';
import { GenerateArtifactExecutor } from './executors/GenerateArtifactExecutor';
import { GoalConfirmationExecutor } from './executors/GoalConfirmationExecutor';
import { AnswerQuestionsExecutor } from './executors/AnswerQuestionsExecutor';
import { ComplexProjectExecutor } from './executors/ComplexProjectExecutor';
import { ScheduleTaskExecutor } from './executors/ScheduleTaskExecutor';
import { StepBasedAgent } from './stepBasedAgent';
import { AgentConstructorParams } from "./interfaces/AgentConstructorParams";

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

export class ConfigurableAgent extends StepBasedAgent {
    async initialize() {
        const settings = this.settingsManager.getSettings();
        const agentConfig = settings.agents[this.constructor.name];
        
        if (!agentConfig) {
            throw new Error(`No configuration found for agent ${this.constructor.name}`);
        }

        await this.initializeFromConfig(agentConfig);
    }

    protected processTask(task: Task): Promise<void> {
        throw new Error('Method not implemented.');
    }
    
    protected async projectCompleted(project: PlanningProject): Promise<void> {
        await super.projectCompleted(project);
    }

    constructor(params: AgentConstructorParams) {
        super(params);
    }
}

export class ProjectManager extends ConfigurableAgent {
    constructor(params: AgentConstructorParams) {
        super(params);
    }

}   
