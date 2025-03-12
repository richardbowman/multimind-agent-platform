import { StepBasedAgent } from './stepBasedAgent';
import { ThinkingExecutor } from './executors/ThinkingExecutor';
import { RefutingExecutor } from './executors/RefutingExecutor';
import { CodeExecutorExecutor } from './executors/CodeExecutorExecutor';
import { NodeExecutorExecutor } from './executors/NodeExecutorExecutor';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { KnowledgeCheckExecutor } from './executors/KnowledgeCheckExecutor';
import { GoalConfirmationExecutor } from './executors/GoalConfirmationExecutor';
import { MultiStepPlanner } from './planners/multiStepPlanner';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { FinalResponseExecutor } from './executors/FinalResponseExecutor';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { ExecutorType } from './interfaces/ExecutorType';
import { NextActionExecutor } from './executors/NextActionExecutor';

export class SolverAgent extends StepBasedAgent {

    constructor(params: AgentConstructorParams) {
        super(params);

        this.modelHelpers.setPurpose('An expert at solving complex problems through careful reasoning who can write JavaScript code.');

        this.planner = null;
        this.supportsDelegation = true;
        // Load procedure guides from markdown files
        this.modelHelpers.loadProcedureGuide('standard-problem-solving');
        this.modelHelpers.loadProcedureGuide('csv-focused');
        this.modelHelpers.loadProcedureGuide('code-focused');
        this.modelHelpers.loadProcedureGuide('simple-problem-solving');

        this.modelHelpers.setFinalInstructions(`SOLVING INSTRUCTIONS
        Use the appropriate sequence based on problem context:
        - For complex problems: Use the standard-problem-solving sequence
        - For coding problems: Use the code-focused sequence
        
        Adapt your approach to the complexity of each problem, using more cycles as needed.`);

        // Register executors using getExecutorParams
        this.registerStepExecutor(new GoalConfirmationExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ThinkingExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new RefutingExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ValidationExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new KnowledgeCheckExecutor(this.getExecutorParams()));
        // this.registerStepExecutor(new CodeExecutorExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new NodeExecutorExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new FinalResponseExecutor(this.getExecutorParams()));
        
        this.registerStepExecutor(new NextActionExecutor(this.getExecutorParams(), this.stepExecutors));
    }

    public async initialize(): Promise<void> {
        // asynchronously check for old tasks and keep working on them
        this.processTaskQueue();
    }
}
