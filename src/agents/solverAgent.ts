import { StepBasedAgent } from './stepBasedAgent';
import { ThinkingExecutor } from './executors/ThinkingExecutor';
import { RefutingExecutor } from './executors/RefutingExecutor';
import { CodeExecutorExecutor } from './executors/CodeExecutorExecutor';
import Logger from 'src/helpers/logger';
import { SOLVER_CHANNEL_ID } from 'src/helpers/config';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { KnowledgeCheckExecutor } from './executors/checkKnowledgeExecutor';
import { GoalConfirmationExecutor } from './executors/GoalConfirmationExecutor';
import { MultiStepPlanner } from './planners/DefaultPlanner';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { FinalResponseExecutor } from './executors/FinalResponseExecutor';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';

export class SolverAgent extends StepBasedAgent<any, any> {
    protected processTask(task: any): Promise<void> {
        throw new Error('Method not implemented.');
    }
    constructor(params: AgentConstructorParams) {
        // Initialize model helpers before calling super
        const modelHelpers = new ModelHelpers(params.llmService, params.userId);
        modelHelpers.setPurpose(`You are an expert at solving complex problems through careful reasoning who can write code.`);
        modelHelpers.setFinalInstructions(`SOLVING INSTRUCTIONS
        Use steps of constructive thinking, critical refutation, and validation to develop robust solutions. 
        In the reasoning field, explain the complexity you see in this goal.
        
        For items that involve math and counting, consider using your coding ability before thinking so you can intepret the value.
        
        AT A MINIMUM, YOU MUST always perform these 6 steps in order:
        1. goal_confirmation (to ensure clear understanding)
        2. check-knowledge (to learn from existing knowledge)
        3. thinking (to develop initial approach)
        4. refuting (to challenge assumptions)
        5. thinking (to refine based on challenges)
        6. validation (to verify the solution)
        
        Adapt your approach to the complexity of each problem, using more cycles as needed.`);

        // Create planner with the correct parameters
        const planner = new MultiStepPlanner(
            params.llmService,
            params.taskManager,
            params.userId,
            modelHelpers
        );

        // Call super with params and planner
        super(params, planner);

        // Register executors after super is called
        this.registerStepExecutor(new GoalConfirmationExecutor(params.llmService, params.userId));
        this.registerStepExecutor(new ThinkingExecutor(params.llmService));
        this.registerStepExecutor(new RefutingExecutor(params.llmService));
        this.registerStepExecutor(new ValidationExecutor(params.llmService));
        this.registerStepExecutor(new KnowledgeCheckExecutor(params.llmService, params.vectorDBService));
        this.registerStepExecutor(new CodeExecutorExecutor(params.llmService));
        this.registerStepExecutor(new FinalResponseExecutor(modelHelpers));

    }

    public async initialize(): Promise<void> {
        Logger.info(`Initialized Solver Assistant`);
        await super.setupChatMonitor(SOLVER_CHANNEL_ID, "@solver");

        // asynchronously check for old tasks and keep working on them
        this.processTaskQueue();
    }
}
