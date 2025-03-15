import Logger from "src/helpers/logger";
import { Task } from "src/tools/taskManager";
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { StepBasedAgent } from './stepBasedAgent';
import { ResearchDecompositionExecutor } from './executors/ResearchDecompositionExecutor';
import { ResearchAggregationExecutor } from './executors/ResearchAggregationExecutor';
import { ResearchGoalsExecutor } from "./executors/ResearchGoalsExecutor";
import { TaskCategories } from "./interfaces/taskCategories";
import { TaskEventType } from "../shared/TaskEventType";
import { StepTask } from "./interfaces/ExecuteStepParams";
import { ExecutorType } from "./interfaces/ExecutorType";
import { CSVProcessingExecutor } from "./executors/CSVProcessingExecutor";


export class ResearchManager extends StepBasedAgent {
    constructor(params: AgentConstructorParams) {
        super(params);

        this.modelHelpers.setPurpose(`You are planning how to conduct Web-based research effectively.`);
        this.modelHelpers.setFinalInstructions(`
Break down Internet research requests into specific tasks and aggregate findings.

For incoming new user requests, you should typically follow this order:
Step 1. 'understand-research-goals' to ensure clarity of request
Step 2. 'decompose-research' step to break down the request
Step 3. 'aggregate-research' to compile findings.


If an incoming request contains a spreadsheet, use the csv-processing to process each row`);
    
        // Register research-specific executors
        this.registerStepExecutor(new ResearchGoalsExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ResearchDecompositionExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ResearchAggregationExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new CSVProcessingExecutor(this.getExecutorParams()));
    }

    protected async taskNotification(task: Task, eventType: TaskEventType): Promise<void> {
        try {
            if (task.category === TaskCategories.WebResearch && task.complete) {
                // const project = await this.projects.getProject(task.projectId);

                // this.planSteps(task.projectId, [{
                //     message: "Researchers completed tasks."
                // }]);

                // await this.executeNextStep({
                //     projectId: task.projectId
                // });
            } else if (eventType === TaskEventType.Completed && task.type === TaskType.Step && (task as StepTask).props?.stepType == ExecutorType.RESEARCH_DECOMPOSITION) {
                super.taskNotification(task, eventType);
            } else {
                super.taskNotification(task, eventType);
            }
        } catch (error) {
            Logger.error('Error handling task:', error);
            throw error;
        }
    }

}
