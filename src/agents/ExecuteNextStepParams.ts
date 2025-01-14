import { ChatPost } from 'src/chat/chatClient';
import { Artifact } from 'src/tools/artifact';
import { Project } from 'src/tools/taskManager';


export interface ExecuteNextStepParams {
    projectId: string;
    userPost?: ChatPost;
    context?: {
        channelId?: string;
        threadId?: string;
        artifacts?: Artifact[];
        projects?: Project[];
    };
}
