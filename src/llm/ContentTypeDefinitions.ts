import { ExecuteParams } from "src/agents/interfaces/ExecuteParams";
import { StepTask } from "src/agents/interfaces/ExecuteStepParams";
import { ChatPost } from "src/chat/chatClient";
import { ChannelData } from "src/shared/channelTypes";
import { Artifact } from "src/tools/artifact";
import { SearchResult } from "./IVectorDatabase";
import { ContentType } from "./promptBuilder";
import { StepResponse, StepResult } from "src/agents/interfaces/StepResult";
import { Agent } from "src/agents/agents";
import { Project, Task } from "src/tools/taskManager";

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
    contentType: ContentType.CHANNEL_GOALS;
    tasks: Task[];
}

export interface StepResponseContent {
    contentType: ContentType.STEP_RESPONSE;
    responses: StepResponse[];
}

export interface ValidationContent {
    contentType: ContentType.VALIDATION_RESULTS;
    step: StepResult;
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
}

export interface IntentContent {
    contentType: ContentType.INTENT;
    params: ExecuteParams;
}

export interface FullGoalsContent {
    contentType: ContentType.GOALS_FULL;
    params: ExecuteParams;
}

export interface StepsContent {
    contentType: ContentType.STEPS;
    steps: StepTask[];
}

export interface TasksContent {
    contentType: ContentType.TASKS;
    tasks: Task[];
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
    | StepResponseContent 
    | ExecuteParamsContent 
    | AgentCapabilitiesContent 
    | AgentOverviewsContent 
    | PurposeContent 
    | ChannelContent 
    | FinalInstructionsContent 
    | OverallGoalContent 
    | StepGoalContent 
    | AboutContent
    | IntentContent
    | FullGoalsContent
    | StepsContent
    | TasksContent;
