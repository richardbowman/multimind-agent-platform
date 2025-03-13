import { ConfigurableAgent } from './configurableAgent';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';

export class SolverAgent extends ConfigurableAgent {
    constructor(params: AgentConstructorParams) {
        super(params);
    }
}
