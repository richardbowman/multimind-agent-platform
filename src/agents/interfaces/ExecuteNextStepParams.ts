import { ChatPost, Message } from 'src/chat/chatClient';
import { Artifact } from 'src/tools/artifact';
import { Project } from 'src/tools/taskManager';
import { UUID } from 'src/types/uuid';


export interface ExecuteNextStepParams {
    projectId: UUID;
    userPost?: Message;
    context?: {
        channelId?: UUID;
        threadId?: UUID;
        artifacts?: Artifact[];
        projects?: Project[];
        threadPosts?: ChatPost[];
    };
    partialPost?: ChatPost;
}
