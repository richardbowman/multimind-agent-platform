import { Project } from "src/tools/taskManager";
import { Task } from "src/tools/taskManager";
import { StepBasedAgent } from './stepBasedAgent';
import { AgentConstructorParams } from "./interfaces/AgentConstructorParams";
import { Planner } from "./planners/planner";
import { MultiStepPlanner } from "./planners/multiStepPlanner";
import { ModelType } from "src/llm/LLMServiceFactory";
import { parseAndMergeNestedHeaders } from "@mattermost/client/lib/client4";
import { NextActionExecutor } from "./executors/NextActionExecutor";
import { StepSequence } from "src/llm/modelHelpers";

export class ConfigurableAgent extends StepBasedAgent {
    agentName: string | undefined;
    private stepSequences: StepSequence[] = [];

    constructor(params: AgentConstructorParams, planner?: Planner) {
        super(params, planner);
        this.agentName = params.agentName;
        if (params.config.plannerType === "nextStep") {
            this.planner = null;
        } else if (params.config.plannerType === "advanced") {
            const planner = new MultiStepPlanner(params.llmService, params.taskManager, params.userId, this.modelHelpers, this.stepExecutors, params.agents);
            planner.modelType = ModelType.ADVANCED_REASONING;
            this.planner = planner;
        }
    }
    
    async initialize() {
        if (!this.agentName) {
            throw new Error(`No name found for agent ${this.agentName}`);
        }

        const agentConfig = this.settings.agents[this.agentName].config;
        
        if (!agentConfig) {
            throw new Error(`No configuration found for agent ${this.agentName}`);
        }

        await this.initializeFromConfig(agentConfig);

        // Initialize step sequences from config if present
        if (agentConfig.stepSequences) {
            this.stepSequences = agentConfig.stepSequences.map(seq => ({
                ...seq,
                steps: seq.steps.map(step => ({
                    ...step,
                    executor: this.stepExecutors.get(step.executor)
                }))
            }));
        }

        if (this.planner === null) {
            this.registerStepExecutor(new NextActionExecutor(this.getExecutorParams(), this.stepExecutors));
        }
    }

    getStepSequences(): StepSequence[] {
        return this.stepSequences;
    }
}
