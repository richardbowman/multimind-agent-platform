import { ChatPost, Message } from 'src/chat/chatClient';
import { Artifact } from 'src/tools/artifact';
import { Project, Task } from 'src/tools/taskManager';
import { UUID } from 'src/types/uuid';
import { StepTask } from './ExecuteStepParams';
import { StepResponse } from './StepResult';

export interface ExecuteContext {
    channelId?: UUID;
    threadId?: UUID;
    artifacts?: Artifact[];
    projects?: Project[];
    threadPosts?: ChatPost[]
}

export interface ExecuteNextStepParams {
    projectId: UUID;
    userPost?: Message;
    projectTask?: Readonly<Task>;
    context?: ExecuteContext;
    partialPost?: ChatPost;
    task?: StepTask<StepResponse>;
}
