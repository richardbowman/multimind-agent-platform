import { Artifact } from 'src/tools/artifact';
import { Project, Task } from 'src/tools/taskManager';
import { StepTask } from './ExecuteStepParams';
import { UUID } from 'src/types/uuid';
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
    readonly previousResponses?: StepResponse[];
    readonly channelGoals: Task[];
    readonly steps: StepTask<StepResponse>[],
    readonly mode?: 'quick' | 'detailed';
    readonly executionMode: 'conversation' | 'task';
    readonly agents?: Agent[];
    readonly self: Agent;
    readonly context?: {
        readonly channelId?: UUID;
        readonly threadId?: UUID;
        readonly artifacts?: Artifact[];
        readonly projects?: Project[];
        readonly threadPosts?: ChatPost[];
    };
    readonly partialResponse: (message: string, newOnly?: boolean) => Promise<void>;
}
