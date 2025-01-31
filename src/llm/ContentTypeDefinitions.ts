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

export interface AboutContent {
    agent: Agent;
}

export type ContentInput = 
    | string 
    | { contentType: ContentType.ARTIFACTS_EXCERPTS, content: ArtifactsExcerptsContent } 
    | { contentType: ContentType.ARTIFACTS_TITLES, content: ArtifactsTitlesContent } 
    | { contentType: ContentType.ARTIFACTS_FULL, content: ArtifactsFullContent } 
    | { contentType: ContentType.CONVERSATION, content: ConversationContent } 
    | { contentType: ContentType.SEARCH_RESULTS, content: SearchResultsContent } 
    | { contentType: ContentType.CODE, content: CodeContent } 
    | { contentType: ContentType.DOCUMENTS, content: DocumentsContent } 
    | { contentType: ContentType.TASKS, content: TasksContent } 
    | { contentType: ContentType.GOALS, content: GoalsContent } 
    | { contentType: ContentType.STEP_RESULTS, content: StepResultsContent } 
    | { contentType: ContentType.EXECUTE_PARAMS, content: ExecuteParamsContent } 
    | { contentType: ContentType.AGENT_CAPABILITIES, content: AgentCapabilitiesContent } 
    | { contentType: ContentType.AGENT_OVERVIEWS, content: AgentOverviewsContent } 
    | { contentType: ContentType.PURPOSE, content: PurposeContent } 
    | { contentType: ContentType.CHANNEL, content: ChannelContent } 
    | { contentType: ContentType.FINAL_INSTRUCTIONS, content: FinalInstructionsContent } 
    | { contentType: ContentType.OVERALL_GOAL, content: OverallGoalContent } 
    | { contentType: ContentType.STEP_GOAL, content: StepGoalContent }
    | { contentType: ContentType.ABOUT, content: AboutContent };
