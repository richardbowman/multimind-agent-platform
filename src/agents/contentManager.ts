import { AgentConstructorParams } from './interfaces/AgentConstructorParams';
import { Project } from "src/tools/taskManager";
import { Task } from "src/tools/taskManager";
import { AssignWritersExecutor } from './executors/WritingExecutor';
import { EditingExecutor } from './executors/EditingExecutor';
import { OutlineExecutor } from './executors/OutlineExecutor';
import { KnowledgeCheckExecutor } from './executors/checkKnowledgeExecutor';
import { ContentCombinationExecutor } from './executors/ContentCombinationExecutor';
import { StepBasedAgent } from './stepBasedAgent';
import { DocumentRetrievalExecutor } from './executors/DocumentRetrievalExecutor';
import { ExecutorType } from './interfaces/ExecutorType';

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
1. Start with 'check-knowledge' step to gather relevant information
2. Follow with 'outline' step to structure the content
3. Then 'assign-writers' to have the writers create the sections
4. Then '${ExecutorType.CONTENT_COMBINATION}' to combine their work together 
5. End with an 'editing' step to improve the final content`);


        // Register our specialized executors
        this.registerStepExecutor(new KnowledgeCheckExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new OutlineExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new AssignWritersExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new EditingExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new DocumentRetrievalExecutor(this.getExecutorParams()));
        this.registerStepExecutor(new ContentCombinationExecutor(this.getExecutorParams()));
        // this.registerStepExecutor(new ValidationExecutor(this.getExecutorParams()));

    }

    public async initialize(): Promise<void> {
        this.processTaskQueue();
    }
}   
