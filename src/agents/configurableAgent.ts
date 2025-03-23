import { StepBasedAgent } from './stepBasedAgent';
import { AgentConstructorParams } from "./interfaces/AgentConstructorParams";
import { Planner } from "./planners/planner";
import { MultiStepPlanner } from "./planners/multiStepPlanner";
import { ModelType } from "src/llm/types/ModelType";
import { NextActionExecutor } from "./executors/NextActionExecutor";
import { ExecutorConstructorParams } from "./interfaces/ExecutorConstructorParams";
import { AgentConfig } from 'src/tools/settings';

export class ConfigurableAgent extends StepBasedAgent {
    protected agentName: string | undefined;
    protected agentConfig?: AgentConfig;
    protected params: AgentConstructorParams;

    constructor(params: AgentConstructorParams, planner?: Planner) {
        super(params, planner);
        this.params = params;
        if (params.agentName) {
            this.agentName = params.agentName;
            this.agentConfig = this.settings.agents[this.agentName].config;
        }
    }
    
    async initialize() {
        if (!this.agentName) {
            throw new Error(`No name found for agent ${this.agentName}`);
        }

        // Set delegation support from config
        this.supportsDelegation = this.agentConfig?.supportsDelegation || false;

        if (this.agentConfig?.plannerType === "nextStep") {
            this.planner = null;
        } else if (this.agentConfig?.plannerType === "advanced") {
            const planner = new MultiStepPlanner(this.params.llmService, this.params.taskManager, this.params.userId, this.modelHelpers, this.stepExecutors, this.params.agents);
            planner.modelType = ModelType.ADVANCED_REASONING;
            this.planner = planner;
        }

        if (!this.agentConfig) {
            throw new Error(`No configuration found for agent ${this.agentName}`);
        }

        await this.initializeFromConfig(this.agentConfig);

        if (this.planner === null) {
            this.registerStepExecutor(new NextActionExecutor(this.getExecutorParams(), this.stepExecutors));
        }
    }

    protected getExecutorParams(): ExecutorConstructorParams {
        const params = super.getExecutorParams();
        params.agentName = this.agentName;
        return params;
    }
}
