import { Project } from "src/tools/taskManager";
import { Task } from "src/tools/taskManager";
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
    agentName: string | undefined;

    constructor(params: AgentConstructorParams, planner?: Planner) {
        super(params, planner);
        this.agentName = params.agentName;
    }
    
    async initialize() {
        const agentConfig = this.settings.agents[this.agentName].config;
        
        if (!agentConfig) {
            throw new Error(`No configuration found for agent ${this.agentName}`);
        }

        await this.initializeFromConfig(agentConfig);
    }

    protected processTask(task: Task): Promise<void> {
        throw new Error('Method not implemented.');
    }
    
    protected async projectCompleted(project: PlanningProject): Promise<void> {
        await super.projectCompleted(project);
    }
}
