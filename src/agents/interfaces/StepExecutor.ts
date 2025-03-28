import { Task, Project } from 'src/tools/taskManager';
import { ExecuteParams } from './ExecuteParams';
import { StepResponse, StepResult } from './StepResult';
import { GenerateInputParams } from '../agents';
import { TaskEventType } from "../../shared/TaskEventType";
import { ChatPost } from 'src/chat/chatClient';
import { StepTask } from './ExecuteStepParams';
import { InputPrompt } from 'src/prompts/structuredInputPrompt';
import { ModelMessageResponse, ModelResponse, ModelResponseMetadata } from 'src/schemas/ModelResponse';
import { WithMetadata } from 'typescript';
import { WithTokens } from 'src/llm/modelHelpers';
import { Artifact, ArtifactItem } from 'src/tools/artifact';
import { FilterCriteria } from 'src/types/FilterCriteria';


export interface TaskNotification {
    task: Task;
    childTask: Task;
    eventType: TaskEventType;
    statusPost?: ChatPost;
}

export interface StepExecutor<R extends StepResponse> {
    execute?(params: ExecuteParams): Promise<StepResult<R>>;
    onTaskNotification?(task: Task): Promise<void>;
    onProjectCompleted?(project: Project): Promise<void>;
    handleTaskNotification?(notification: TaskNotification): Promise<void>;
    /**
     * Optional method for async executors to provide final StepResult when their sub-project completes
     * @param project The completed project
     * @returns Final StepResult to return to the parent step
     */
    onChildProjectComplete?(stepTask: StepTask<R>, project: Project): Promise<StepResult<R>>;
}

export type ModelConversationResponse = WithTokens<WithMetadata<ModelMessageResponse, ModelResponseMetadata>>;

export interface ModelConversation<R extends StepResponse> extends InputPrompt {
    generate(input: Partial<GenerateInputParams>) : Promise<ModelConversationResponse>;
    addProcedures(filter: FilterCriteria): Promise<Artifact[]>;
}

