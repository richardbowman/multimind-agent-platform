import { ChatPost, Message } from 'src/chat/chatClient';
import { Artifact } from 'src/tools/artifact';
import { Project } from 'src/tools/taskManager';
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
}
