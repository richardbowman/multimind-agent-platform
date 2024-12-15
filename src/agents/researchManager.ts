import Logger from "src/helpers/logger";
import { CONTENT_MANAGER_USER_ID, PROJECTS_CHANNEL_ID } from '../helpers/config';
import { HandlerParams } from "./agents";
import { Project, Task } from "src/tools/taskManager";
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { StepBasedAgent } from './stepBasedAgent';
import { MultiStepPlanner } from './planners/DefaultPlanner';
import { ModelHelpers } from 'src/llm/helpers';
import { ResearchDecompositionExecutor } from './executors/ResearchDecompositionExecutor';
import { ResearchAggregationExecutor } from './executors/ResearchAggregationExecutor';

export interface ResearchProject extends Project<Task> {
    goal: string;
}

export class ResearchManager extends StepBasedAgent<ResearchProject, Task> {
    protected processTask(task: Task): Promise<void> {
        throw new Error("Method not implemented.");
    }

    constructor(params: AgentConstructorParams) {
        const modelHelpers = new ModelHelpers(params.llmService, params.userId);
        const planner = new MultiStepPlanner(params.llmService, params.taskManager, params.userId, modelHelpers);
        super(params, planner);
        this.modelHelpers = modelHelpers;

        // Register research-specific executors
        this.registerStepExecutor(new ResearchDecompositionExecutor(params.llmService, params.taskManager));
        this.registerStepExecutor(new ResearchAggregationExecutor(params.llmService, this.artifactManager, params.vectorDBService));

        this.modelHelpers.setPurpose(`You are planning how to conduct research effectively.`);
        this.modelHelpers.setFinalInstructions(`
Break down research requests into specific tasks and aggregate findings.

IMPORTANT: For incoming new requests, follow this pattern:
Step 1. 'decompose-research' step to break down the request
Step 2. 'aggregate-research' to compile findings`);
    }

    protected async taskNotification(task: Task): Promise<void> {
        try {
            if (task.type === "assign-researchers") {
                if (task.complete) {
                    const project = this.projects.getProject(task.projectId);
                    this.planSteps({
                        message: "Researchers completed tasks.",
                        projects: [project]
                    } as HandlerParams);

                    const post = await this.chatClient.getPost(project.metadata.originalPostId);
                    await this.executeNextStep(project.id, post);
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
        await super.setupChatMonitor(PROJECTS_CHANNEL_ID, "@research");
        this.processTaskQueue();
    }

    protected async projectCompleted(project: Project<Task>): Promise<void> {
        if (project.metadata.parentTaskId) {
            // Get all completed tasks' results
            const tasks = Object.values(project.tasks);
            const completedResults = tasks
                .filter(t => t.complete)
                .map(t => t.props?.result)
                .filter(r => r);

            // Combine all results into one
            const combinedResult = completedResults
                .map(r => r.message || r.reasoning || '')
                .filter(msg => msg)
                .join('\n\n');

            // Update parent task with combined results
            const parentTask = await this.projects.getTaskById(project.metadata.parentTaskId);
            if (!parentTask.props) parentTask.props = {};
            parentTask.props.result = {
                message: combinedResult,
                subProjectResults: completedResults
            };

            await this.projects.assignTaskToAgent(project.metadata.parentTaskId, CONTENT_MANAGER_USER_ID);
            const parentProject = await this.projects.getProject(parentTask.projectId);

            // Store the combined results in the project's metadata
            parentProject.metadata.subProjectResults = completedResults;

            this.projects.completeTask(project.metadata.parentTaskId);
        } else {
            super.projectCompleted(project);
        }
    }

}
