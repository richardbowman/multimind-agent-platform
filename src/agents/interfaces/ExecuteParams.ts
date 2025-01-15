import { ModelResponse } from 'src/schemas/ModelResponse';
import { Artifact } from 'src/tools/artifact';
import { Project } from 'src/tools/taskManager';
import { StepTask } from './ExecuteStepParams';


export interface ExecuteParams {
    readonly agentId: string;
    readonly message?: string;
    readonly stepGoal?: string;
    readonly overallGoal?: string;
    readonly goal: string;
    readonly step: string;
    readonly stepId: string;
    readonly projectId: string;
    readonly previousResult?: ModelResponse[];
    readonly steps: StepTask[],
    readonly mode?: 'quick' | 'detailed';
    readonly executionMode: 'conversation' | 'task';
    readonly agents?: Array<{
        readonly id: string;
        readonly handle: string;
        readonly type: string;
    }>;
    readonly context?: {
        readonly channelId?: string;
        readonly threadId?: string;
        readonly artifacts?: Artifact[];
        readonly projects?: Project[];
    };
}
