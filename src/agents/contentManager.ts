import { randomUUID } from 'crypto';
import Logger from '../helpers/logger';
import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { Project } from "src/tools/taskManager";
import { Task } from "src/tools/taskManager";
import { Artifact } from 'src/tools/artifact';
import { AssignWritersExecutor } from './executors/WritingExecutor';
import { EditingExecutor } from './executors/EditingExecutor';
import { OutlineExecutor } from './executors/OutlineExecutor';
import { KnowledgeCheckExecutor } from './executors/checkKnowledgeExecutor';
import { StepBasedAgent } from './stepBasedAgent';
import { MultiStepPlanner } from './planners/multiStepPlanner';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { DocumentRetrievalExecutor } from './executors/DocumentRetrievalExecutor';

export interface ContentProject extends Project {
    goal: string;
    description: string;
}

export interface ContentTask extends Task {
    title?: string;
    content?: string;
}

export class ContentManager extends StepBasedAgent {
    constructor(params: AgentConstructorParams) {
        const modelHelpers = new ModelHelpers(params.llmService, params.userId);
        const planner = new MultiStepPlanner(params.llmService, params.taskManager, params.userId, modelHelpers)
        super(params, planner);

        // Create standardized params
        const executorParams = {
            llmService: params.llmService,
            vectorDB: params.vectorDBService,
            taskManager: params.taskManager,
            artifactManager: this.artifactManager,
            userId: params.userId
        };

        // Register our specialized executors
        this.registerStepExecutor(new KnowledgeCheckExecutor(executorParams));
        this.registerStepExecutor(new OutlineExecutor(executorParams));
        this.registerStepExecutor(new AssignWritersExecutor(executorParams));
        this.registerStepExecutor(new EditingExecutor(executorParams));
        this.registerStepExecutor(new DocumentRetrievalExecutor(executorParams));
        // this.registerStepExecutor(new ValidationExecutor(executorParams));

        this.modelHelpers.setPurpose(`You are planning how to create high-quality content.
Break down the content creation into steps of research, outlining, writing and editing.
Use 'check-knowledge' steps to gather information, 'outline' steps to structure the content,
'writing' steps to develop sections, 'editing' steps to improve quality, and 'document-retrieval' steps to fetch stored artifacts.

IMPORTANT: Always follow this pattern:
1. Start with a 'check-knowledge' step to gather relevant information
2. Follow with an 'outline' step to structure the content
3. Then you can 'assign-writers' to have the writers create the sections
4. End with an 'editing' step to improve the final content`);
    }

    protected async taskNotification(task: ContentTask): Promise<void> {
        try {
            if (task.type === "assign-writers") {
                if (task.complete) {
                    const project = this.projects.getProject(task.projectId);

                    this.planSteps(task.projectId, [{ 
                        message: "Writers completed tasks."
                    }]);

                    const post = await this.chatClient.getPost(project.metadata.originalPostId);

                    await this.executeNextStep({
                        projectId: project.id, 
                        userPost: post
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

    protected async processTask(task: Task): Promise<void> {

    }

    protected async projectCompleted(project: ContentProject): Promise<void> {
        const finalContent = Object.values(project.tasks).reduce((acc, task) => acc + task.content, '\n\n');
        const responseMessage = `The combined content has been shared:\n${finalContent}`;
        const content : Artifact = {
            id: randomUUID(),
            content: finalContent,
            type: "content",
            metadata: {
                goal: project.goal,
                projectId: project.id
            }
        }
        await this.artifactManager.saveArtifact(content);

        // Store the artifact ID in the project's metadata for editing tasks
        project.metadata.contentArtifactId = content.id;

        if (project.metadata.parentTaskId) {
            //TODO: hack for now, we don't assign workign steps to agent right now
            await this.projects.assignTaskToAgent(project.metadata.parentTaskId, this.userId);

            const parentTask = await this.projects.getTaskById(project.metadata.parentTaskId);
            const parentProject = await this.projects.getProject(parentTask.projectId);

            // Store the artifact ID in the project's metadata for editing tasks
            parentProject.metadata.contentArtifactId = content.id;

            this.projects.completeTask(project.metadata.parentTaskId);

            const post = await this.chatClient.getPost(parentProject.metadata.originalPostId);
            this.reply(post, { message: responseMessage }, {
                "artifact-ids": [content.id]
            });
        } else {
            // this.chatClient.postInChannel(PROJECTS_CHANNEL_ID, responseMessage, {
            //     "artifact-ids": [content.id]
            // });
        }
    }

    public async initialize(): Promise<void> {
        this.processTaskQueue();
    }
}   
