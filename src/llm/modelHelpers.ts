import { ChatPost } from "src/chat/chatClient";
import { ILLMService, LLMContext } from "./ILLMService";
import { ModelCache } from "./modelCache";
import { ModelMessageResponse, ModelResponse, RequestArtifacts } from "src/schemas/ModelResponse";
import Logger from "src/helpers/logger";
import JSON5 from "json5";
import { GenerateInputParams, ProjectHandlerParams, ThreadSummary } from "src/agents/agents";
import { Artifact } from "src/tools/artifact";
import { StructuredOutputPrompt } from "./ILLMService";
import { SearchResult } from "./IVectorDatabase";
import { PromptBuilder, PromptRegistry } from "./promptBuilder";
import { asError, isObject } from "src/types/types";
import { InputPrompt } from "src/prompts/structuredInputPrompt";
import { StringUtils } from "src/utils/StringUtils";
import { withRetry } from "src/helpers/retry";

export interface ModelHelpersParams {
    llmService: ILLMService;
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

export class ModelHelpers {
    protected promptRegistry: PromptRegistry;
    protected context: LLMContext;
    protected llmService: ILLMService;
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

    private async generateStructured<T extends ModelResponse>(structure: StructuredOutputPrompt, params: GenerateInputParams): Promise<T> {
        const { contextWindow, maxTokens } = params;
        const prompt = await structure.getPrompt();
        let augmentedInstructions;
        let response: T;

        // Augment instructions with context and generate a response
        const history = params.threadPosts || params.projectChain?.posts.slice(0, -1) || [];

        if (isObject(prompt) && prompt instanceof PromptBuilder) {
            augmentedInstructions = await prompt.build();
        } else if (typeof prompt === "string") {
            augmentedInstructions = this.addDateToSystemPrompt(prompt);
            augmentedInstructions = `OVERALL PURPOSE: ${this.getPurpose()}\n\n${augmentedInstructions}\n\nOverall agent instructions: ${this.getFinalInstructions()}`;
        };

        try {
            return withRetry<T>(async () => {
                try {
                    const augmentedStructuredInstructions = new StructuredOutputPrompt(structure.getSchema(), augmentedInstructions);
                    response = await this.llmService.generateStructured<T>(params.userPost ? params.userPost : params.message ? params : { message: "" }, augmentedStructuredInstructions, history, contextWindow, maxTokens);
                    return response;
                } catch (error) {
                    Logger.error("Error generating", error);
                    throw error;
                }
            }, (response) => {
                // Validate response against schema
                try {
                    StringUtils.validateJsonAgainstSchema(response, structure.getSchema());
                    return true;
                } catch (error) {
                    // Add error feedback to instructions for retry
                    augmentedInstructions += `\n\nPrevious attempt failed validation. Please ensure your response includes all required properties:\n${error.message}`;
                    throw new Error(`Response does not conform to schema:\n${asError(error).message}`);
                }
            }, {
                maxRetries: 2
            })
        } catch (error) {
            throw new Error(`Failed to generate valid response after retries: ${asError(error).message}`);
        }
    }

    public async generate<T extends WithTokens<RequestArtifacts>>(params: GenerateInputParams): Promise<T> {
        if (params.instructions instanceof StructuredOutputPrompt) {
            return this.generateStructured<T>(params.instructions, params);
        } else {
            return this.generateMessage(params);
        }
    }


    public async generateMessage(params: GenerateInputParams): Promise<WithTokens<RequestArtifacts>> {
        const instructions = params.instructions;
        let augmentedInstructions: string;
        if (typeof instructions === "string") {
            augmentedInstructions = this.addDateToSystemPrompt(`AGENT PURPOSE: ${this.purpose}\n\nINSTRUCTIONS: ${instructions}`);
        } else if (instructions instanceof Promise) {
            augmentedInstructions = await instructions;
        } else if (instructions instanceof StructuredOutputPrompt) {
            throw new Error("GenerateMessage does not support structured output");
        } else {
            augmentedInstructions = await instructions.getInstructions();
        }

        // Augment instructions with context and generate a response
        const history = params.threadPosts || (params as ProjectHandlerParams).projectChain?.posts.slice(0, -1) || [];
        const response = await withRetry(() => {
            return this.llmService.generate(augmentedInstructions, params.userPost || { message: params.message || params.content || "" }, history, {
                modelType: params.modelType,
                context: {
                    ...this.context,
                    ...params.context
                }
            });
        }, () => true, { maxRetries: 2, timeoutMs: 180000 });

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
