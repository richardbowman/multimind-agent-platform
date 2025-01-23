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
import { ContentCombinationExecutor } from './executors/ContentCombinationExecutor';
import { StepBasedAgent } from './stepBasedAgent';
import { MultiStepPlanner } from './planners/multiStepPlanner';
import { ModelHelpers } from 'src/llm/modelHelpers';
import { DocumentRetrievalExecutor } from './executors/DocumentRetrievalExecutor';
import { TaskCategories } from './interfaces/taskCategories';
import { TaskEventType } from './agents';

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
        super(params);

        this.modelHelpers.setPurpose(`You are planning how to create high-quality content.
Break down the content creation into steps of research, outlining, writing and editing.
Use 'check-knowledge' steps to gather information, 'outline' steps to structure the content,
'writing' steps to develop sections, 'editing' steps to improve quality, and 'document-retrieval' steps to fetch stored artifacts.

IMPORTANT: Always follow this pattern:
1. Start with a 'check-knowledge' step to gather relevant information
2. Follow with an 'outline' step to structure the content
3. Then you can 'assign-writers' to have the writers create the sections
4. End with an 'editing' step to improve the final content`);


        // Register our specialized executors
        this.registerStepExecutor(new KnowledgeCheckExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new OutlineExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new AssignWritersExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new EditingExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new DocumentRetrievalExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ContentCombinationExecutor(this.getExecutorParams()));
        // this.registerStepExecutor(new ValidationExecutor(this.getExecutorParams()));

    }

    protected async projectCompleted(project: Project): Promise<void> {
        // Use the ContentCombinationExecutor to combine content
        const combinationExecutor = new ContentCombinationExecutor(this.getExecutorParams());
        const result = await combinationExecutor.execute({ project });

        if (!result.success) {
            throw new Error('Failed to combine content');
        }

        const responseMessage = `The combined content has been shared:\n${result.artifacts?.[0]?.content}`;

        if (project.metadata.parentTaskId) {
            //TODO: hack for now, we don't assign working steps to agent right now
            await this.projects.assignTaskToAgent(project.metadata.parentTaskId, this.userId);

            const parentTask = await this.projects.getTaskById(project.metadata.parentTaskId);
            if (parentTask) {
                const parentProject = await this.projects.getProject(parentTask.projectId);

                // Store the artifact ID in the project's metadata for editing tasks
                parentProject.metadata.contentArtifactId = result.artifacts?.[0]?.id;

                this.projects.completeTask(project.metadata.parentTaskId);

                if (parentProject.metadata.originalPostId) {
                    const post = await this.getMessage(parentProject.metadata.originalPostId);
                    if (post) {
                        this.reply(post, { message: responseMessage }, {
                            "artifact-ids": result.artifacts?.map(a => a.id)
                        });
                    } else {
                        Logger.error(`Couldn't find post ${parentProject.metadata.originalPostId}`);
                    }
                } else {
                    Logger.error("Could not find associated post.");
                }
            } else {
                Logger.error("Could not find parent task");
            }
        } else {
            Logger.error("Could not find parent task ID");
        }
    }

    public async initialize(): Promise<void> {
        this.processTaskQueue();
    }
}   
