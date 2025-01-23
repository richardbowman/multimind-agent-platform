import { ChatPost } from "src/chat/chatClient";
import { ILLMService } from "./ILLMService";
import { ModelCache } from "./modelCache";
import { ModelMessageResponse, ModelResponse, RequestArtifacts } from "src/schemas/ModelResponse";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import Logger from "src/helpers/logger";
import JSON5 from "json5";
import { GenerateInputParams, GenerateParams, HandlerParams, ProjectHandlerParams, ThreadSummary } from "src/agents/agents";
import { Artifact } from "src/tools/artifact";
import { ArtifactManager } from "src/tools/artifactManager";
import { StructuredOutputPrompt } from "./ILLMService";
import { SearchResult } from "./IVectorDatabase";
import { StepResult, StepResultType } from "src/agents/interfaces/StepResult";
import { ExecuteParams } from "src/agents/interfaces/ExecuteParams";
import { StepTask } from "src/agents/interfaces/ExecuteStepParams";

export interface ModelHelpersParams {
    llmService: ILLMService;
    userId: string;
    finalInstructions?: string;
    messagingHandle?: string;
}

export class StepSequence {
    private steps: { type: string, description: string }[] = [];
    private currentStepIndex = 0;
    private name: string;
    private description: string;

    constructor(
        name: string,
        description: string,
        initialSteps?: { type: string, description: string }[]
    ) {
        this.name = name;
        this.description = description;
        if (initialSteps) {
            this.steps = initialSteps;
        }
    }

    getName() {
        return this.name;
    }

    getDescription() {
        return this.description;
    }

    addStep(type: string, description: string) {
        this.steps.push({ type, description });
    }

    getNextStep() {
        if (this.currentStepIndex >= this.steps.length) {
            return null;
        }
        return this.steps[this.currentStepIndex++];
    }

    reset() {
        this.currentStepIndex = 0;
    }

    getAllSteps() {
        return this.steps;
    }

    getCurrentStep() {
        if (this.currentStepIndex >= this.steps.length) {
            return null;
        }
        return this.steps[this.currentStepIndex];
    }
}

export enum ContentType {
    ARTIFACTS = 'artifacts',
    CONVERSATION = 'conversation',
    SEARCH_RESULTS = 'search_results',
    CODE = 'code',
    DOCUMENTS = 'documents',
    TASKS = 'tasks',
    GOALS = 'goals',
    STEP_RESULTS = 'step_results',
    EXECUTE_PARAMS = 'execute_params'
}

export interface ContentRenderer<T> {
    (content: T): string;
}

export class PromptRegistry {
    private contentRenderers: Map<ContentType, ContentRenderer<any>> = new Map();

    constructor() {
        // Register default renderers
        this.registerRenderer(ContentType.ARTIFACTS, this.renderArtifacts.bind(this));
        this.registerRenderer(ContentType.CONVERSATION, this.renderConversation.bind(this));
        this.registerRenderer(ContentType.STEP_RESULTS, this.renderStepResults.bind(this));
        this.registerRenderer(ContentType.EXECUTE_PARAMS, this.renderExecuteParams.bind(this));
        
        // Register type-specific step result renderers
        this.registerStepResultRenderer(StepResultType.Validation, this.renderValidationStep.bind(this));
        this.registerStepResultRenderer(StepResultType.Question, this.renderQuestionStep.bind(this));
        // Add more type-specific renderers as needed
    }

    private renderExecuteParams(params: ExecuteParams): string {
        let output = `🎯 Goal:\n${params.goal}\n\n`;
        
        if (params.step) {
            output += `🔧 Current Step:\n${params.step}\n\n`;
        }
        
        if (params.executionMode) {
            output += `⚙️ Execution Mode:\n${params.executionMode}\n\n`;
        }
        
        if (params.context) {
            output += `📌 Context:\n${JSON.stringify(params.context, null, 2)}\n\n`;
        }
        
        return output;
    }

    private stepResultRenderers = new Map<StepResultType, ContentRenderer<StepResult>>();

    registerStepResultRenderer(type: StepResultType, renderer: ContentRenderer<StepResult>): void {
        this.stepResultRenderers.set(type, renderer);
    }

    private renderStepResults(steps: StepTask[]): string {
        const stepsWithResults = steps?.filter(s => s.props?.result?.type && s.props.result != undefined);
        if (!stepsWithResults || stepsWithResults.length === 0) return '';
        
        return "📝 Step History:\n\n" + stepsWithResults.map((step, index) => {
            const stepResult = step.props.result!;
            const typeRenderer = this.stepResultRenderers.get(stepResult.type!);
            if (typeRenderer) {
                return typeRenderer(stepResult);
            }
            // Default renderer for unknown types
            return `Step ${index + 1} (${stepResult.type}):\n${stepResult.response?.message}`;
        }).join('\n\n');
    }

    private renderValidationStep(step: StepResult): string {
        const metadata = step.response.metadata;
        return `🔍 Validation Step:\n` +
            `- Status: ${step.finished ? 'Complete' : 'In Progress'}\n` +
            `- Attempts: ${metadata?.validationAttempts || 1}\n` +
            `- Missing Aspects: ${metadata?.missingAspects?.join(', ') || 'None'}\n` +
            `- Result: ${step.response.message}`;
    }

    private renderQuestionStep(step: StepResult): string {
        return `❓ Question Step:\n` +
            `- Question: ${step.response.message}\n` +
            `- Status: ${step.finished ? 'Answered' : 'Pending'}`;
    }

    registerRenderer<T>(contentType: ContentType, renderer: ContentRenderer<T>): void {
        this.contentRenderers.set(contentType, renderer);
    }

    getRenderer(contentType: ContentType): ContentRenderer<any> | undefined {
        return this.contentRenderers.get(contentType);
    }

    private renderArtifacts(artifacts: Artifact[]): string {
        if (!artifacts || artifacts.length === 0) return '';
        return "📁 Attached Artifacts:\n\n" + artifacts.map((artifact, index) => {
            const content = typeof artifact.content === 'string' 
                ? artifact.content
                : `[Binary data - ${artifact.content.length} bytes]`;
            return `Artifact ${index + 1} (${artifact.type}):\n${content}`;
        }).join('\n\n');
    }

    private renderConversation(posts: ChatPost[]): string {
        if (!posts || posts.length === 0) return '';
        return "💬 Conversation Context:\n\n" + posts.map(post => 
            `${post.user_id}: ${post.message}`
        ).join('\n');
    }
}

export class PromptBuilder {
    private contentSections: Map<ContentType, any> = new Map();
    private instructions: string[] = [];
    private context: string[] = [];
    private registry: PromptRegistry;

    constructor(registry?: PromptRegistry) {
        this.registry = registry || new PromptRegistry();
    }

    registerRenderer<T>(contentType: ContentType, renderer: ContentRenderer<T>): void {
        this.registry.registerRenderer(contentType, renderer);
    }

    addContent<T>(contentType: ContentType, content: T): void {
        this.contentSections.set(contentType, content);
    }

    addInstruction(instruction: string): void {
        this.instructions.push(instruction);
    }

    addContext(context: string): void {
        this.context.push(context);
    }

    build(): string {
        const sections: string[] = [];

        // Add instructions first
        if (this.instructions.length > 0) {
            sections.push("## Instructions\n" + this.instructions.join('\n\n'));
        }

        // Add context
        if (this.context.length > 0) {
            sections.push("## Context\n" + this.context.join('\n\n'));
        }

        // Render and add content sections
        for (const [contentType, content] of this.contentSections) {
            const renderer = this.registry.getRenderer(contentType);
            if (renderer) {
                const rendered = renderer(content);
                if (rendered) {
                    sections.push(`## ${contentType[0].toUpperCase()}${contentType.slice(1)}\n` + rendered);
                }
            }
        }

        return sections.join('\n\n');
    }
}

export class ModelHelpers {
    private stepSequences: StepSequence[] = [];
    private promptRegistry: PromptRegistry = new PromptRegistry();

    createPrompt() {
        return new PromptBuilder(this.promptRegistry);
    }
    getPurpose() {
        return this.purpose;
    }
    getFinalInstructions() {
        return this.finalInstructions;
    }

    addStepSequence(name: string, description: string, steps: { type: string, description: string }[]) {
        this.stepSequences.push(new StepSequence(name, description, steps));
    }

    getStepSequences() {
        return this.stepSequences;
    }

    getStepSequence(name?: string) {
        if (name) {
            return this.stepSequences.find(s => s.getName() === name);
        }
        return this.stepSequences[0]; // Default to first sequence
    }
    

    protected llmService: ILLMService;
    protected isMemoryEnabled: boolean = false;
    protected purpose: string = 'You are a helpful agent.';
    private modelCache: ModelCache;
    private threadSummaries: Map<string, ThreadSummary> = new Map();
    protected userId: string;
    protected finalInstructions?: string;
    protected messagingHandle?: string;

    constructor(params: ModelHelpersParams) {
        this.userId = params.userId;
        this.llmService = params.llmService;
        this.finalInstructions = params.finalInstructions;
        this.messagingHandle = params.messagingHandle;
        this.modelCache = new ModelCache();
    }

    protected addDateToSystemPrompt(content: string): string {
        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(' ')[0];
        const agentIdentity = this.messagingHandle ? `Agent Handle: ${this.messagingHandle}\n` : '';
        return `${agentIdentity}Current date: ${date}\nCurrent time: ${time}\n\n${content}`;
    }

    public setPurpose(purpose: string) {
        this.purpose = purpose;
    }

    public setFinalInstructions(instructions: string) {
        this.finalInstructions = instructions;
    }

    public enableMemory() {
        this.isMemoryEnabled = true;
    }

    public async getThreadSummary(posts: ChatPost[]): Promise<string> {
        // If thread is short enough, no need to summarize
        if (posts.length <= 3) {
            return posts.map(p => `${p.user_id === this.userId ? 'Assistant' : 'User'}: ${p.message}`).join('\n');
        }

        const threadId = posts[0].getRootId() || posts[0].id;
        const existingSummary = this.threadSummaries.get(threadId);
        
        // Find index of last processed message
        let startIndex = 0;
        if (existingSummary) {
            startIndex = posts.findIndex(p => p.id === existingSummary.lastProcessedMessageId) + 1;
            if (startIndex <= 0) {
                // If we can't find the last processed message, start fresh
                startIndex = 0;
            }
        }

        // If no new messages to process, return existing summary
        if (startIndex === posts.length && existingSummary) {
            return existingSummary.summary;
        }

        // Get new messages that need to be processed
        const newMessages = posts.slice(startIndex);

        const llmMessages = [{
            role: "system",
            content: this.addDateToSystemPrompt(existingSummary 
                ? `Given this existing conversation summary:
                   "${existingSummary.summary}"
                   
                   Update it to include these new messages, maintaining the same concise style.
                   Focus on how the new messages advance or change the conversation.
                   Keep the total summary under 200 words.`
                : `Summarize this conversation thread concisely, focusing on:
                   1. The main topic or request
                   2. Key decisions or information shared
                   3. The current state of the discussion
                   Keep the summary under 200 words.`)
        }];

        // Add only new messages as context
        newMessages.forEach(post => {
            llmMessages.push({
                role: post.user_id === this.userId ? "assistant" : "user",
                content: post.message
            });
        });

        const updatedSummary = await this.llmService.sendMessageToLLM(
            "Please update/create the conversation summary.",
            llmMessages
        );

        // Store the updated summary
        this.threadSummaries.set(threadId, {
            summary: updatedSummary,
            lastProcessedMessageId: posts[posts.length - 1].id,
            messageCount: posts.length
        });

        return `Thread Summary:\n${updatedSummary}\n\nLatest message:\n${posts[posts.length - 1].message}`;
    }

    public async classifyImportantInformation(channelId: string, history: ChatPost[], previousMemory?: string): Promise<string[]> {
        const llmMessages: { role: string, content: string }[] = [];

        // Add system message explaining the task
        llmMessages.push({
            role: "system",
            content: this.addDateToSystemPrompt(`You are an AI assistant tasked with analyzing a conversation and identifying key points
            or actions that should be remembered. Focus on remembering information about the user and their intentions.
            Respond with a new complete set of memories you want to keep moving forward as a JSON array of strings, where
            each string is a summary of an important point. Don't keep duplicate information, and limit yourself to 10 or less total.`)
        });

        // Add previous memory if available
        if (previousMemory) {
            llmMessages.push({
                role: "system",
                content: `Previous Memory: ${previousMemory}`
            });
        }

        // Add chat history messages
        for (const post of history) {
            const role = post.user_id === this.userId ? "assistant" : "user";
            llmMessages.push({ role: role, content: `${post.message}` });
        }

        // Get the LLM response
        const rawResponse = await this.llmService.sendMessageToLLM(history[history.length - 1].message, llmMessages, undefined, 8192, 512, {
            type: "array",
            items: { type: "string" }
        });

        // Parse the response
        const importantPoints = JSON5.parse(rawResponse);

        Logger.info(`Important points identified in channel ${channelId}:`, importantPoints);
        return importantPoints;
    }

    private async generateStructured<T extends ModelResponse>(structure: StructuredOutputPrompt, params: GenerateParams): Promise<T> {
        // Initialize JSON schema validator
        const ajv = new Ajv({ allErrors: true, strict: false });
        addFormats(ajv);
        const validate = ajv.compile(structure.getSchema());
        // Check cache first
        const cacheContext = {
            params,
            schema: structure.getSchema()
        };
        // const cachedResponse = this.modelCache.get(structure.getPrompt(), cacheContext);
        // if (cachedResponse) {
        //     return cachedResponse as T;
        // }

        // Fetch the latest memory artifact for the channel
        let augmentedInstructions = this.addDateToSystemPrompt(structure.getPrompt());
        augmentedInstructions = `OVERALL PURPOSE: ${this.getPurpose()}\n\n${augmentedInstructions}\n\nOverall agent instructions: ${this.getFinalInstructions()}`;

        if (this.isMemoryEnabled) {
            const memoryArtifact = await this.fetchLatestMemoryArtifact(params.userPost.channel_id);

            // Append the memory content to the instructions if it exists
            if (memoryArtifact && memoryArtifact.content) {
                const memoryContent = memoryArtifact.content.toString();
                augmentedInstructions += `\n\nContext from previous interactions:\n${memoryContent}`;
            }
        }

        // Deduplicate artifacts first, then search results
        const deduplicatedArtifacts = params.artifacts ? this.deduplicateArtifacts(params.artifacts) : [];
        const deduplicatedSearchResults = params.searchResults ? this.deduplicateSearchResults(params.searchResults, deduplicatedArtifacts) : undefined;

        if (deduplicatedSearchResults) {
            augmentedInstructions += `\n\nSearch results from knowledge base:\n${deduplicatedSearchResults.map(s => `<searchresult>Result ID: ${s.id}\nResult Title:${s.metadata.title}\nResult Content:\n${s.text}</searchresult>\n\n`)}`;
        }

        if (deduplicatedArtifacts) {
            for (const artifact of deduplicatedArtifacts) {
                const artifactContent = artifact.content ? artifact.content.toString() : 'No content available';
                augmentedInstructions += `\n\n<artifact>Artifact ID: ${artifact.id}\nTitle: ${artifact.metadata?.title || 'No title'}\nContent:\n${artifactContent}</artifact>`;
            }
        }

        // Augment instructions with context and generate a response
        const history = params.threadPosts || params.projectChain?.posts.slice(0, -1) || [];

        const { contextWindow, maxTokens } = params;

        let response: T;
        let attempts = 0;
        const maxAttempts = 2;

        while (attempts < maxAttempts) {
            try {
                const augmentedStructuredInstructions = new StructuredOutputPrompt(structure.getSchema(), augmentedInstructions);
                response = await this.llmService.generateStructured<T>(params.userPost?params.userPost:params.message?  params:{ message: ""}, augmentedStructuredInstructions, history, contextWindow, maxTokens);

                // Validate response against schema
                const isValid = validate(response);
                if (!isValid) {
                    const errors = validate.errors?.map(err => 
                        `Schema validation error at ${err.instancePath}: ${err.message}`
                    ).join('\n');
                    
                    if (attempts < maxAttempts - 1) {
                        // Add error feedback to instructions for retry
                        augmentedInstructions += `\n\nPrevious attempt failed validation. Please ensure your response includes all required properties:\n${errors}`;
                        attempts++;
                        continue;
                    }
                    throw new Error(`Response does not conform to schema:\n${errors}`);
                }

                //TODO: seems confusing hopefully not used
                // if (params.artifacts) {
                //     response.artifactIds = params.artifacts?.map(a => a.id);
                // }
                
                // Cache the response
                //this.modelCache.set(structure.getPrompt(), cacheContext, response);
                
                return response;
            } catch (error) {
                Logger.error("Error generating", error);
                if (attempts >= maxAttempts - 1) {
                    throw error;
                }
                attempts++;
            }
        }

        throw new Error('Failed to generate valid response after retries');
    }

    public async generate<T extends ModelResponse>(params: GenerateInputParams): Promise<T> {
        if (params.instructions instanceof StructuredOutputPrompt) {
            return this.generateStructured<T>(params.instructions, params);
        } else {
            return this.generateOld(params.instructions.toString(), params);
        }
    }

    /**
     * @deprecated
     */
    public deduplicateArtifacts(artifacts: Artifact[]): Artifact[] {
        const seenArtifacts = new Set<string>();
        return artifacts.filter(artifact => {
            const { id: artifactId } = artifact;
            if (seenArtifacts.has(artifactId)) {
                return false;
            }
            seenArtifacts.add(artifactId);
            return true;
        });
    }

    public deduplicateSearchResults(searchResults: SearchResult[], artifacts: Artifact[]): SearchResult[] {
        const seenChunks = new Set<string>();
        const artifactUrls = new Set<string>(artifacts.map(a => `artifact://${a.id}`));

        return searchResults.filter(result => {
            if (seenChunks.has(result.id)) {
                return false;
            }
            if (artifactUrls.has(result.metadata.url)) {
                return false;
            }

            seenChunks.add(result.id);
            return true;
        });
    }

    public async fetchLatestMemoryArtifact(channelId: string, artifactManager: ArtifactManager): Promise<Artifact | null> {
        const artifact = await artifactManager.loadArtifact(`${channelId}-${this.userId}-memory`);
        return artifact;
    }

    public formatArtifacts(artifacts?: Artifact[]): string {
        if (!artifacts || artifacts.length === 0) return '';

        let message = "📁 Attached Artifacts:\n\n";
        artifacts.forEach((artifact, index) => {
            message += `Artifact ${index + 1} (${artifact.type}):\n`;
            if (typeof artifact.content === 'string') {
                const maxLength = 1000;
                const content = artifact.content;
                if (content.length > maxLength) {
                    message += `[First ${maxLength} characters shown - document truncated]\n`;
                    message += content.substring(0, maxLength) + '\n\n';
                    message += `[Document continues... Total length: ${content.length} characters]\n\n`;
                } else {
                    message += content + '\n\n';
                }
            } else {
                message += `[Binary data - ${artifact.content.length} bytes]\n\n`;
            }
        });
        return message;
    }

    private async generateOld(instructions: string, params: GenerateParams): Promise<ModelMessageResponse> {
        // Check cache first
        const cacheContext = { params };
        const cachedResponse = this.modelCache.get(instructions, cacheContext);
        if (cachedResponse) {
            return cachedResponse;
        }

        // Fetch the latest memory artifact for the channel
        let augmentedInstructions = this.addDateToSystemPrompt(`AGENT PURPOSE: ${this.purpose}\n\nINSTRUCTIONS: ${instructions}`);

        if (this.isMemoryEnabled && (params as HandlerParams).userPost) {
            const memoryArtifact = await this.fetchLatestMemoryArtifact((params as HandlerParams).userPost.channel_id);

            // Append the memory content to the instructions if it exists
            if (memoryArtifact && memoryArtifact.content) {
                const memoryContent = memoryArtifact.content.toString();
                augmentedInstructions += `\n\nContext from previous interactions:\n${memoryContent}`;
            }
        }

        // Deduplicate artifacts first, then search results
        const deduplicatedArtifacts = params.artifacts ? this.deduplicateArtifacts(params.artifacts) : [];
        const deduplicatedSearchResults = params.searchResults ? this.deduplicateSearchResults(params.searchResults, deduplicatedArtifacts) : undefined;

        if (deduplicatedSearchResults) {
            augmentedInstructions += `\n\nSearch results from knowledge base:\n${deduplicatedSearchResults.map(s => `<searchresult>Result ID: ${s.id}\nResult Title:${s.metadata.title}\nResult Content:\n${s.text}</searchresult>\n\n`)}`;
        }

        if (deduplicatedArtifacts) {
            for (const artifact of deduplicatedArtifacts) {
                const artifactContent = artifact.content ? artifact.content.toString() : 'No content available';
                augmentedInstructions += `\n\n<artifact>Artifact ID: ${artifact.id}\nTitle: ${artifact.metadata?.title || 'No title'}\nContent:\n${artifactContent}</artifact>`;
            }
        }

        // Augment instructions with context and generate a response
        const history = (params as HandlerParams).threadPosts || (params as ProjectHandlerParams).projectChain?.posts.slice(0, -1) || [];
        const response = await this.llmService.generate(augmentedInstructions, (params as HandlerParams).userPost||{message:params.message||params.content||""}, history);

        // Ensure response is an object with message property
        const formattedResponse: ModelMessageResponse = typeof response === "string" 
            ? { message: response }
            : response;

        // Set artifact IDs if we have any
        if (params.artifacts?.length) {
            formattedResponse.artifactIds = params.artifacts.map(a => a.id);
        }

        // Cache the response
        this.modelCache.set(instructions, cacheContext, formattedResponse);
        
        return formattedResponse;
    }
}
