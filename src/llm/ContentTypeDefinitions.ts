import { Task } from "electron";
import { Agent } from "http";
import { ExecuteParams } from "src/agents/interfaces/ExecuteParams";
import { StepTask } from "src/agents/interfaces/ExecuteStepParams";
import { ChatPost } from "src/chat/chatClient";
import { ChannelData } from "src/shared/channelTypes";
import { Artifact } from "src/tools/artifact";
import { SearchResult } from "./IVectorDatabase";
import { ContentType } from "./promptBuilder";

export interface ArtifactsExcerptsContent {
    contentType: ContentType.ARTIFACTS_EXCERPTS;
    artifacts: Artifact[];
}

export interface ArtifactsTitlesContent {
    contentType: ContentType.ARTIFACTS_TITLES;
    artifacts: Artifact[];
}

export interface ArtifactsFullContent {
    contentType: ContentType.ARTIFACTS_FULL;
    artifacts: Artifact[];
}

export interface ConversationContent {
    contentType: ContentType.CONVERSATION;
    posts: ChatPost[];
}

export interface SearchResultsContent {
    contentType: ContentType.SEARCH_RESULTS;
    searchResults: SearchResult[];
}

export interface CodeContent {
    contentType: ContentType.CODE;
    code: string;
}

export interface DocumentsContent {
    contentType: ContentType.DOCUMENTS;
    documents: Document[];
}

export interface TasksContent {
    contentType: ContentType.TASKS;
    tasks: Task[];
}

export interface GoalsContent {
    contentType: ContentType.GOALS;
    tasks: Task[];
}

export interface StepResultsContent {
    contentType: ContentType.STEP_RESULTS;
    steps: StepTask[];
}

export interface ExecuteParamsContent {
    contentType: ContentType.EXECUTE_PARAMS;
    params: ExecuteParams;
}

export interface AgentCapabilitiesContent {
    contentType: ContentType.AGENT_CAPABILITIES;
    agents: Agent[];
}

export interface AgentOverviewsContent {
    contentType: ContentType.AGENT_OVERVIEWS;
    agents: Agent[];
}

export interface PurposeContent {
    contentType: ContentType.PURPOSE;
    purpose: string;
}

export interface ChannelContent {
    contentType: ContentType.CHANNEL;
    channel: ChannelData;
}

export interface FinalInstructionsContent {
    contentType: ContentType.FINAL_INSTRUCTIONS;
    instructions: string;
}

export interface OverallGoalContent {
    contentType: ContentType.OVERALL_GOAL;
    goal: string;
}

export interface StepGoalContent {
    contentType: ContentType.STEP_GOAL;
    goal: string;
}

export interface AboutContent {
    contentType: ContentType.ABOUT;
    agent: Agent;
}

export type ContentInput = 
    | string 
    | ArtifactsExcerptsContent 
    | ArtifactsTitlesContent 
    | ArtifactsFullContent 
    | ConversationContent 
    | SearchResultsContent 
    | CodeContent 
    | DocumentsContent 
    | TasksContent 
    | GoalsContent 
    | StepResultsContent 
    | ExecuteParamsContent 
    | AgentCapabilitiesContent 
    | AgentOverviewsContent 
    | PurposeContent 
    | ChannelContent 
    | FinalInstructionsContent 
    | OverallGoalContent 
    | StepGoalContent 
    | AboutContent;
