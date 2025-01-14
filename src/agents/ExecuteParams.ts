import { ModelResponse } from 'src/schemas/ModelResponse';
import { Artifact } from 'src/tools/artifact';
import { Project } from 'src/tools/taskManager';
import { StepTask } from './ExecuteStepParams';


export interface ExecuteParams {
    agentId: string;
    message?: string;
    stepGoal?: string;
    overallGoal?: string;
    goal: string;
    step: string;
    projectId: string;
    previousResult?: ModelResponse[];
    steps: StepTask[],
    mode?: 'quick' | 'detailed';
    executionMode: 'conversation' | 'task';
    agents?: Array<{
        id: string;
        handle: string;
        type: string;
    }>;
    context?: {
        channelId?: string;
        threadId?: string;
        artifacts?: Artifact[];
        projects?: Project[];
    };
}
