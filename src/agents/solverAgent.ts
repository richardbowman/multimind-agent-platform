import { StepBasedAgent } from './stepBasedAgent';
import { ThinkingExecutor } from './executors/ThinkingExecutor';
import { RefutingExecutor } from './executors/RefutingExecutor';
import { CodeExecutorExecutor } from './executors/CodeExecutorExecutor';
import { NodeExecutorExecutor } from './executors/NodeExecutorExecutor';
import { ValidationExecutor } from './executors/ValidationExecutor';
import { KnowledgeCheckExecutor } from './executors/checkKnowledgeExecutor';
import { GoalConfirmationExecutor } from './executors/GoalConfirmationExecutor';
import { MultiStepPlanner } from './planners/multiStepPlanner';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { FinalResponseExecutor } from './executors/FinalResponseExecutor';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { ExecutorType } from './interfaces/ExecutorType';

export class SolverAgent extends StepBasedAgent {

    constructor(params: AgentConstructorParams) {
        super(params);

        // Set purpose and instructions
        this.modelHelpers.setPurpose(`You are an expert at solving complex problems through careful reasoning who can write code.`);
        // Define standard sequences for different scenarios
        const standardProblemSolvingSequence = [
            { 
                type: ExecutorType.GOAL_CONFIRMATION,
                description: "Confirm understanding of the problem and goals"
            },
            {
                type: ExecutorType.CHECK_KNOWLEDGE,
                description: "Check existing knowledgebase for relevant information"
            },
            {
                type: ExecutorType.THINKING,
                description: "Develop initial approach to solving the problem"
            },
            {
                type: ExecutorType.REFUTING,
                description: "Challenge assumptions and identify potential flaws"
            },
            {
                type: ExecutorType.THINKING,
                description: "Refine approach based on challenges identified"
            },
            {
                type: ExecutorType.VALIDATION,
                description: "Verify the proposed solution"
            },
            {
                type: ExecutorType.FINAL_RESPONSE,
                description: "Provide final answer to the user"
            }
        ];

        const codeFocusedSequence = [
            { 
                type: ExecutorType.GOAL_CONFIRMATION,
                description: "Confirm understanding of the coding problem"
            },
            {
                type: ExecutorType.NODE_EXECUTION,
                description: "Write and execute code to analyze or prototype solution"
            },
            {
                type: ExecutorType.THINKING,
                description: "Analyze code results and develop follow-up approach"
            },
            {
                type: ExecutorType.NODE_EXECUTION,
                description: "Write and execute code based on the results of the first code execution"
            },
            {
                type: ExecutorType.VALIDATION,
                description: "Verify code correctness and results"
            },
            {
                type: ExecutorType.FINAL_RESPONSE,
                description: "Provide final code solution and explanation"
            }
        ];

        // Add sequences to modelHelpers
        this.modelHelpers.addStepSequence(
            'standard-problem-solving',
            'Standard sequence for solving complex problems',
            standardProblemSolvingSequence
        );

        this.modelHelpers.addStepSequence(
            'code-focused',
            'Sequence for problems requiring code execution',
            codeFocusedSequence
        );

        this.modelHelpers.setFinalInstructions(`SOLVING INSTRUCTIONS
        Use the appropriate sequence based on problem context:
        - For complex problems: Use the standard-problem-solving sequence
        - For coding problems: Use the code-focused sequence
        
        Adapt your approach to the complexity of each problem, using more cycles as needed.
        
        You have access to project artifacts through the ARTIFACTS global variable when using Node.js code execution.
        Artifacts are available as an array of objects with these properties:
        - id: Unique identifier
        - name: Human-readable name
        - type: Type of artifact (e.g. 'file', 'data', 'image')
        - content: The actual content (string, JSON, etc)
        - metadata: Additional information about the artifact`);

        // Register executors using getExecutorParams
        this.registerStepExecutor(new GoalConfirmationExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ThinkingExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new RefutingExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ValidationExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new KnowledgeCheckExecutor(this.getExecutorParams()));
        // this.registerStepExecutor(new CodeExecutorExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new NodeExecutorExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new FinalResponseExecutor(this.getExecutorParams()));

    }

    public async initialize(): Promise<void> {
        // asynchronously check for old tasks and keep working on them
        this.processTaskQueue();
    }
}
