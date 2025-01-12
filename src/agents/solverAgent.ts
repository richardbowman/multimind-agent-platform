import { StepBasedAgent } from './stepBasedAgent';
import { ThinkingExecutor } from './executors/ThinkingExecutor';
import { RefutingExecutor } from './executors/RefutingExecutor';
import { CodeExecutorExecutor } from './executors/CodeExecutorExecutor';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { KnowledgeCheckExecutor } from './executors/checkKnowledgeExecutor';
import { GoalConfirmationExecutor } from './executors/GoalConfirmationExecutor';
import { MultiStepPlanner } from './planners/multiStepPlanner';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { FinalResponseExecutor } from './executors/FinalResponseExecutor';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';

export class SolverAgent extends StepBasedAgent {
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
        
        Here is a typical strategy:
        1. goal_confirmation (to ensure clear understanding)
        2. check-knowledge (to learn from existing knowledge)
        3. thinking (to develop initial approach)
        4. refuting (to challenge assumptions)
        5. thinking (to refine based on challenges)
        6. validation (to verify the solution)
        7. final_response (to give the user your answer)
        
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

        // Create standardized params
        const executorParams = {
            llmService: params.llmService,
            taskManager: params.taskManager,
            artifactManager: this.artifactManager,
            vectorDBService: params.vectorDBService,
            userId: params.userId,
            modelHelpers: modelHelpers,
            vectorDB: params.vectorDBService
        };

        // Register executors after super is called
        this.registerStepExecutor(new GoalConfirmationExecutor(executorParams));
        this.registerStepExecutor(new ThinkingExecutor(executorParams));
        this.registerStepExecutor(new RefutingExecutor(executorParams));
        this.registerStepExecutor(new ValidationExecutor(executorParams));
        this.registerStepExecutor(new KnowledgeCheckExecutor(executorParams));
        this.registerStepExecutor(new CodeExecutorExecutor(executorParams));
        this.registerStepExecutor(new FinalResponseExecutor(executorParams));

    }

    public async initialize(): Promise<void> {
        // asynchronously check for old tasks and keep working on them
        this.processTaskQueue();
    }
}
