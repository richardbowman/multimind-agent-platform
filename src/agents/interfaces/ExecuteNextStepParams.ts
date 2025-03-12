import { ChatPost, Message } from 'src/chat/chatClient';
import { LLMContext } from 'src/llm/ILLMService';
import { Artifact } from 'src/tools/artifact';
import { Project, Task } from 'src/tools/taskManager';
import { UUID } from 'src/types/uuid';

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
    context?: ExecuteContext;
    partialPost?: ChatPost;
    task?: Task;
}
