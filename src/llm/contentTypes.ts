import { Task } from "electron";
import { Agent } from "http";
import { ExecuteParams } from "src/agents/interfaces/ExecuteParams";
import { StepTask } from "src/agents/interfaces/ExecuteStepParams";
import { ChatPost } from "src/chat/chatClient";
import { ChannelData } from "src/shared/channelTypes";
import { Artifact } from "src/tools/artifact";
import { Project } from "src/tools/taskManager";
import { SearchResult } from "./IVectorDatabase";

export interface ArtifactsExcerptsContent {
    artifacts: Artifact[];
}

export interface ArtifactsTitlesContent {
    artifacts: Artifact[];
}

export interface ArtifactsFullContent {
    artifacts: Artifact[];
}

export interface ConversationContent {
    posts: ChatPost[];
}

export interface SearchResultsContent {
    searchResults: SearchResult[];
}

export interface CodeContent {
    code: string;
}

export interface DocumentsContent {
    documents: Document[];
}

export interface TasksContent {
    tasks: Task[];
}

export interface GoalsContent {
    tasks: Task[];
}

export interface StepResultsContent {
    steps: StepTask[];
}

export interface ExecuteParamsContent {
    params: ExecuteParams;
}

export interface AgentCapabilitiesContent {
    agents: Agent[];
}

export interface AgentOverviewsContent {
    agents: Agent[];
}

export interface PurposeContent {
    purpose: string;
}

export interface ChannelContent {
    channel: ChannelData;
}

export interface FinalInstructionsContent {
    instructions: string;
}

export interface OverallGoalContent {
    goal: string;
}

export interface StepGoalContent {
    goal: string;
}
