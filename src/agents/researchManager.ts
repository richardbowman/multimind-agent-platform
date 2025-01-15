import Logger from "src/helpers/logger";
import { Task } from "src/tools/taskManager";
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { StepBasedAgent } from './stepBasedAgent';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { ResearchDecompositionExecutor } from './executors/ResearchDecompositionExecutor';
import { ResearchAggregationExecutor } from './executors/ResearchAggregationExecutor';
import { ResearchGoalsExecutor } from "./executors/ResearchGoalsExecutor";
import { TaskCategories } from "./interfaces/taskCategories";


export class ResearchManager extends StepBasedAgent {
    protected processTask(task: Task): Promise<void> {
        throw new Error("Method not implemented.");
    }

    constructor(params: AgentConstructorParams) {
        super(params);

        this.modelHelpers.setPurpose(`You are planning how to conduct Web-based research effectively.`);
        this.modelHelpers.setFinalInstructions(`
Break down Internet research requests into specific tasks and aggregate findings.

For incoming new user requests, you should typically follow this order:
Step 1. 'understand-research-goals' to ensure clarity of request
Step 2. 'decompose-research' step to break down the request
Step 3. 'aggregate-research' to compile findings`);
    
        // Register research-specific executors
        this.registerStepExecutor(new ResearchGoalsExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ResearchDecompositionExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ResearchAggregationExecutor(this.getExecutorParams()));
    }

    protected async taskNotification(task: Task): Promise<void> {
        try {
            if (task.category === TaskCategories.WebResearch) {
                if (task.complete) {
                    this.planSteps(task.projectId, [{
                        message: "Researchers completed tasks."
                    }]);

                    const project = await this.projects.getProject(task.projectId);
                    await this.executeNextStep({
                        projectId: project.id
                    });
                }
            } else {
                super.taskNotification(task);
            }
        } catch (error) {
            Logger.error('Error handling task:', error);
            throw error;
        }
    }

    public async initialize(): Promise<void> {
        this.processTaskQueue();
    }


}
