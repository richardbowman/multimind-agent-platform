import { Project } from "src/tools/taskManager";
import { Task } from "src/tools/taskManager";
import { StepBasedAgent } from './stepBasedAgent';
import { AgentConstructorParams } from "./interfaces/AgentConstructorParams";
import { Planner } from "./planners/planner";

export class ConfigurableAgent extends StepBasedAgent {
    agentName: string | undefined;

    constructor(params: AgentConstructorParams, planner?: Planner) {
        super(params, planner);
        this.agentName = params.agentName;
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
    }
}
