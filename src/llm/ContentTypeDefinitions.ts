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
    project: Project;
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
