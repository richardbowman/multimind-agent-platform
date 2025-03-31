import { StepBasedAgent } from './stepBasedAgent';
import { AgentConstructorParams } from "./interfaces/AgentConstructorParams";
import { Planner } from "./planners/planner";
import { NextActionExecutor } from "./executors/NextActionExecutor";
import { ExecutorConstructorParams } from "./interfaces/ExecutorConstructorParams";
import { AgentConfig } from 'src/tools/AgentConfig';

/**
 * @deprecated need to collapse into MarkdownConfigurableAgent
 */
export class ConfigurableAgent extends StepBasedAgent {
    protected agentName: string | undefined;
    protected agentConfig?: AgentConfig;
    protected params: AgentConstructorParams;

    constructor(params: AgentConstructorParams, planner?: Planner) {
        super(params, planner);
        this.params = params;
        if (params.agentName) {
            this.agentName = params.agentName;
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
            throw new Error("Advanced planner no longer supported");
        }

        if (!this.agentConfig) {
            throw new Error(`No configuration found for agent ${this.agentName}`);
        }

        await this.initializeFromConfig(this.agentConfig);

        if (!this.planner) {
            this.registerStepExecutor(new NextActionExecutor(this.getExecutorParams(), this.stepExecutors));
        }
    }

    protected getExecutorParams(): ExecutorConstructorParams {
        const params = super.getExecutorParams();
        params.agentName = this.agentName;
        return params;
    }
}
