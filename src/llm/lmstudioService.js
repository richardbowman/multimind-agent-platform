"use strict";
// lmstudioService.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const sdk_1 = require("@lmstudio/sdk");
const logger_1 = __importDefault(require("src/helpers/logger"));
const json5_1 = __importDefault(require("json5"));
const LLMLogger_1 = require("./LLMLogger");
class MyEmbedder {
    constructor(embeddingModel) {
        this.embeddingModel = embeddingModel;
    }
    async generate(texts) {
        const embeddings = [];
        for (const text of texts) {
            const modelEmbedding = await this.embeddingModel.embedString(text);
            embeddings.push(modelEmbedding.embedding);
        }
        return embeddings;
    }
}
const ILLMService_1 = require("./ILLMService");
class LMStudioService {
    constructor() {
        this.lmStudioClient = new sdk_1.LMStudioClient({
            baseUrl: process.env.LMSTUDIO_BASEURL
        });
        this.logger = new LLMLogger_1.LLMCallLogger('lmstudio');
    }
    getTokenCount(message) {
        if (!this.chatModel)
            throw new Error("LM Studio not initalized");
        return this.chatModel.unstable_countTokens(message);
    }
    async initializeEmbeddingModel(modelPath) {
        try {
            const loadedModels = await this.lmStudioClient.embedding.listLoaded();
            if (loadedModels.find((model) => model.identifier === modelPath) !== undefined) {
                this.embeddingModel = new MyEmbedder(await this.lmStudioClient.embedding.get(modelPath));
                logger_1.default.info("Connected to existing embedding model.");
            }
            else {
                this.embeddingModel = new MyEmbedder(await this.lmStudioClient.embedding.load(modelPath));
                logger_1.default.info("Embedding model loaded.");
            }
        }
        catch (error) {
            logger_1.default.error("Failed to initialize embedding model:", error);
            throw error;
        }
    }
    async initializeLlamaModel(modelPath) {
        try {
            const loaded = await this.lmStudioClient.llm.listLoaded();
            if (loaded.find((model) => model.identifier === modelPath) !== undefined) {
                this.chatModel = await this.lmStudioClient.llm.get(modelPath);
                logger_1.default.info("Connected to existing LLaMA model.");
            }
            else {
                this.chatModel = await this.lmStudioClient.llm.load(modelPath, { verbose: false });
                logger_1.default.info("LLaMA model loaded.");
            }
        }
        catch (error) {
            logger_1.default.error("Failed to initialize LLaMA model:", error);
            throw error;
        }
    }
    async generate(instructions, userPost, history, opts) {
        const input = { instructions, userPost, history };
        const messageChain = [
            ...this.mapPosts(userPost, history),
            {
                role: ILLMService_1.ModelRole.USER,
                content: userPost.message
            }
        ];
        const result = await this.getChatModel().respond(messageChain, {});
        const output = {
            message: result.content
        };
        await this.logger.logCall('generate', input, output);
        return output;
    }
    async sendMessageToLLM(message, history, seedAssistant, contextWindowLength, maxTokens, schema) {
        const input = { message, history, seedAssistant, contextWindowLength, maxTokens, schema };
        if (!this.chatModel) {
            throw new Error("LLaMA model is not initialized.");
        }
        // Add the current message to the history
        const userMessage = { role: "user", content: message };
        history.push(userMessage);
        if (seedAssistant) {
            // Add the assistant's message to the history
            const assistantMessage = { role: "assistant", content: seedAssistant };
            history.push(assistantMessage);
        }
        // // If contextWindowLength is provided, truncate the history
        // const contextLength = parseInt(process.env.CONTEXT_SIZE||"") || contextWindowLength || 4096;
        // let tokenCount = 0;
        // for (let i = history.length - 1; i >= 0; i--) {
        //     const messageTokens = await this.chatModel.unstable_countTokens(history[i].content);
        //     tokenCount += messageTokens;
        //     if (tokenCount > contextLength) {
        //         history = history.slice(i + 1);
        //         break;
        //     }
        // }
        const opts = { maxPredictedTokens: maxTokens };
        if (schema) {
            opts.structured = { type: "json", jsonSchema: schema };
        }
        // Set the maxTokens parameter for the LLaMA model
        const prediction = this.chatModel.respond(history, opts);
        const finalResult = await prediction;
        const resultBody = finalResult.content;
        const inclSeed = (resultBody.length > 0 ? ((seedAssistant || "") + resultBody.trim()) : "");
        // Remove the last message from the history (user's message)
        return inclSeed;
    }
    mapPosts(userPost, posts) {
        if (!posts)
            return [];
        return posts.map(h => ({
            role: h.user_id === userPost.user_id ? ILLMService_1.ModelRole.USER : ILLMService_1.ModelRole.ASSISTANT,
            content: h.message
        }));
    }
    async sendStructuredRequest(message, instructions, history, contextWindowLength, maxTokens) {
        if (!this.chatModel) {
            throw new Error("LLaMA model is not initialized.");
        }
        // Add the current message to the history
        const userMessage = { role: "user", content: message };
        let messageChain = [
            ...history || [], userMessage
        ];
        const opts = { structured: { type: "json", jsonSchema: instructions.getSchema() }, maxPredictedTokens: maxTokens };
        // If contextWindowLength is provided, truncate the history
        const contextLength = parseInt(process.env.CONTEXT_SIZE || "") || contextWindowLength || 4096;
        let tokenCount = 0;
        for (let i = messageChain.length - 1; i >= 0; i--) {
            const messageTokens = await this.chatModel.unstable_countTokens(messageChain[i].content);
            tokenCount += messageTokens;
            if (tokenCount > contextLength) {
                logger_1.default.info("CUTTING TOKENS");
                messageChain = messageChain.slice(i + 1);
                break;
            }
        }
        // Set the maxTokens parameter for the LLaMA model
        const prediction = this.chatModel.respond(messageChain, opts);
        const finalResult = await prediction;
        try {
            const resultBody = finalResult.content;
            const output = json5_1.default.parse(resultBody);
            await this.logger.logCall('generateStructured', input, output);
            return output;
        }
        catch (error) {
            await this.logger.logCall('generateStructured', input, null, error);
            throw error;
        }
    }
    async generateStructured(userPost, instructions, history, contextWindowLength, maxTokens) {
        const input = { userPost, instructions: instructions.getPrompt(), history, contextWindowLength, maxTokens };
        if (!this.chatModel) {
            throw new Error("LLaMA model is not initialized.");
        }
        // Add the current message to the history
        const systemMessage = { role: "system", content: instructions.getPrompt() };
        const userMessage = { role: "user", content: userPost.message };
        let messageChain = [
            systemMessage, ...this.mapPosts(userPost, history), userMessage
        ];
        const opts = { structured: { type: "json", jsonSchema: instructions.getSchema() }, maxPredictedTokens: maxTokens };
        // Set the maxTokens parameter for the LLaMA model
        try {
            const prediction = this.chatModel.respond(messageChain, opts);
            const finalResult = await prediction;
            const resultBody = finalResult.content;
            const output = json5_1.default.parse(resultBody);
            await this.logger.logCall('generateStructured', input, output);
            return output;
        }
        catch (error) {
            await this.logger.logCall('generateStructured', input, null, error);
            throw error;
        }
    }
    getEmbeddingModel() {
        if (!this.embeddingModel)
            throw new Error("LMStudioService not initalized");
        return this.embeddingModel;
    }
    getChatModel() {
        if (!this.chatModel)
            throw new Error("LMStudioService not initalized");
        return this.chatModel;
    }
}
exports.default = LMStudioService;
