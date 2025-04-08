import { ILLMService, LLMContext, LLMServices } from "./ILLMService";
import { ModelCache } from "./modelCache";
import { RequestArtifacts } from "src/schemas/ModelResponse";
import Logger from "src/helpers/logger";
import { GenerateInputParams, ThreadSummary } from "src/agents/agents";
import { PromptBuilder, PromptRegistry } from "./promptBuilder";
import { withRetry } from "src/helpers/retry";
import { ModelType } from "./types/ModelType";

export interface ModelHelpersParams {
    /** @deprecated */
    llmService: ILLMService;
    llmServices: LLMServices;
    userId: string;
    purpose?: string;
    finalInstructions?: string;
    messagingHandle?: string;
    context: LLMContext;
    promptRegistry: PromptRegistry;
}

export type WithTokens<T> = T extends object ? T & {
    _usage?: {
        inputTokens: number;
        outputTokens: number;
    };
} : never;

export type WithMetadata<T, M> = T & {
    metadata?: M;
};

export class ModelHelpers {
    protected promptRegistry: PromptRegistry;
    protected context: LLMContext;
    /** @deprecated */
    protected llmService: ILLMService;
    protected llmServices: LLMServices;
    protected isMemoryEnabled: boolean = false;
    protected purpose: string = 'You are a helpful agent.';
    protected modelCache: ModelCache;
    protected threadSummaries: Map<string, ThreadSummary> = new Map();
    protected userId: string;
    protected finalInstructions?: string;
    readonly messagingHandle?: string;

    constructor(params: ModelHelpersParams) {
        this.userId = params.userId;
        this.llmService = params.llmService;
        this.llmServices = params.llmServices;
        this.finalInstructions = params.finalInstructions;
        this.messagingHandle = params.messagingHandle;
        this.modelCache = new ModelCache();
        if (params.purpose) this.purpose = params.purpose;
        this.finalInstructions = params.finalInstructions;
        this.context = params.context;
        this.promptRegistry = params.promptRegistry || new PromptRegistry(this);
    }

    createPrompt() {
        const prompt = new PromptBuilder(this.promptRegistry);

        const now = new Date();
        const date = now.toISOString().split('T')[0];
        const time = now.toTimeString().split(' ')[0];
        const agentIdentity = this.messagingHandle ? `🤖 Agent Handle: ${this.messagingHandle}\n` : '';

        prompt.addContext(`${agentIdentity}Current date: ${date}\nCurrent time: ${time}\nLanguage: US English\n`);
        return prompt;
    }

    getPurpose() {
        return this.purpose;
    }
    getFinalInstructions() {
        return this.finalInstructions;
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

    public async generate<T extends WithTokens<RequestArtifacts>>(params: GenerateInputParams): Promise<T> {
        return this.generateMessage(params);
    }


    public async generateMessage(params: GenerateInputParams): Promise<WithTokens<RequestArtifacts>> {
        const instructions = params.instructions;
        let augmentedInstructions: string;
        if (typeof instructions === "string") {
            augmentedInstructions = this.addDateToSystemPrompt(`AGENT PURPOSE: ${this.purpose}\n\nINSTRUCTIONS: ${instructions}`);
        } else if (instructions instanceof Promise) {
            augmentedInstructions = await instructions;
        } else {
            augmentedInstructions = await instructions.getInstructions();
        }

        // Augment instructions with context and generate a response
        const history = params.threadPosts || [];
        const response = await withRetry(() => {
            // use fallback for now until we figure out all the spots
            const modernLookup = this.llmServices[params.modelType||ModelType.CONVERSATION]||this.llmServices.conversation;
            if (!modernLookup) {
                Logger.warn(`Modern LLM Service Lookup Failed for ${params.modelType} for agent ${params.context?.agentName} step ${params.context?.stepType}`);
            }
            const service = modernLookup || this.llmService;
            
            return service.generate(augmentedInstructions, params.userPost || { message: params.message || params.content || "" }, history, {
                modelType: params.modelType,
                context: {
                    ...this.context,
                    ...params.context
                }
            });
        }, () => true, { maxAttempts: 2, timeoutMs: 180000 });

        // Ensure response is an object with message property
        const formattedResponse: RequestArtifacts = typeof response === "string"
            ? { message: response }
            : response;

        // Set artifact IDs if we have any
        if (params.artifacts?.length) {
            formattedResponse.artifactIds = params.artifacts.map(a => a.id);
        }

        return formattedResponse;
    }
}
