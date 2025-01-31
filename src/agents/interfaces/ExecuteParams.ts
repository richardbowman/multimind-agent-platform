import { ModelResponse } from 'src/schemas/ModelResponse';
import { Artifact } from 'src/tools/artifact';
import { Project, Task } from 'src/tools/taskManager';
import { StepTask } from './ExecuteStepParams';
import { UUID } from 'src/types/uuid';
import { ChatHandle } from 'src/types/chatHandle';
import { ChatPost } from 'src/chat/chatClient';
import { Agent } from '../agents';
import { StepResponse } from './StepResult';

export interface ExecuteParams {
    readonly agentId: UUID;
    readonly message?: string;
    readonly stepGoal: string;
    readonly overallGoal?: string;
    readonly goal: string;
    readonly step: string;
    readonly stepId: UUID;
    readonly projectId: UUID;
    readonly previousResult?: StepResponse[];
    readonly channelGoals: Task[];
    readonly steps: StepTask[],
    readonly mode?: 'quick' | 'detailed';
    readonly executionMode: 'conversation' | 'task';
    readonly agents?: Agent[];
    readonly context?: {
        readonly channelId?: string;
        readonly threadId?: string;
        readonly artifacts?: Artifact[];
        readonly projects?: Project[];
        readonly threadPosts?: ChatPost[];
    };
    readonly partialResponse: (message: string) => Promise<void>;
}
