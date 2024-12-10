"use strict";
// lmstudioService.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRole = exports.StructuredOutputPrompt = void 0;
var sdk_1 = require("@lmstudio/sdk");
var logger_1 = require("src/helpers/logger");
var json5_1 = require("json5");
var MyEmbedder = /** @class */ (function () {
    function MyEmbedder(embeddingModel) {
        this.embeddingModel = embeddingModel;
    }
    MyEmbedder.prototype.generate = function (texts) {
        return __awaiter(this, void 0, void 0, function () {
            var embeddings, _i, texts_1, text, modelEmbedding;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        embeddings = [];
                        _i = 0, texts_1 = texts;
                        _a.label = 1;
                    case 1:
                        if (!(_i < texts_1.length)) return [3 /*break*/, 4];
                        text = texts_1[_i];
                        return [4 /*yield*/, this.embeddingModel.embedString(text)];
                    case 2:
                        modelEmbedding = _a.sent();
                        embeddings.push(modelEmbedding.embedding);
                        _a.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, embeddings];
                }
            });
        });
    };
    return MyEmbedder;
}());
var StructuredOutputPrompt = /** @class */ (function () {
    function StructuredOutputPrompt(schema, prompt) {
        this.schema = schema;
        this.prompt = prompt;
    }
    StructuredOutputPrompt.prototype.getSchema = function () {
        return this.schema;
    };
    StructuredOutputPrompt.prototype.getPrompt = function () {
        return this.prompt;
    };
    return StructuredOutputPrompt;
}());
exports.StructuredOutputPrompt = StructuredOutputPrompt;
var ModelRole;
(function (ModelRole) {
    ModelRole["USER"] = "user";
    ModelRole["ASSISTANT"] = "assistant";
})(ModelRole || (exports.ModelRole = ModelRole = {}));
var LMStudioService = /** @class */ (function () {
    function LMStudioService() {
        this.lmStudioClient = new sdk_1.LMStudioClient({
            baseUrl: process.env.LMSTUDIO_BASEURL
        });
    }
    LMStudioService.prototype.initializeEmbeddingModel = function (modelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var loadedModels, _a, _b, _c, _d, error_1;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _e.trys.push([0, 6, , 7]);
                        return [4 /*yield*/, this.lmStudioClient.embedding.listLoaded()];
                    case 1:
                        loadedModels = _e.sent();
                        if (!(loadedModels.find(function (model) { return model.identifier === modelPath; }) !== undefined)) return [3 /*break*/, 3];
                        _a = this;
                        _b = MyEmbedder.bind;
                        return [4 /*yield*/, this.lmStudioClient.embedding.get(modelPath)];
                    case 2:
                        _a.embeddingModel = new (_b.apply(MyEmbedder, [void 0, _e.sent()]))();
                        logger_1.default.info("Connected to existing embedding model.");
                        return [3 /*break*/, 5];
                    case 3:
                        _c = this;
                        _d = MyEmbedder.bind;
                        return [4 /*yield*/, this.lmStudioClient.embedding.load(modelPath)];
                    case 4:
                        _c.embeddingModel = new (_d.apply(MyEmbedder, [void 0, _e.sent()]))();
                        logger_1.default.info("Embedding model loaded.");
                        _e.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_1 = _e.sent();
                        logger_1.default.error("Failed to initialize embedding model:", error_1);
                        throw error_1;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    LMStudioService.prototype.initializeLlamaModel = function (modelPath) {
        return __awaiter(this, void 0, void 0, function () {
            var loaded, _a, _b, error_2;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 6, , 7]);
                        return [4 /*yield*/, this.lmStudioClient.llm.listLoaded()];
                    case 1:
                        loaded = _c.sent();
                        if (!(loaded.find(function (model) { return model.identifier === modelPath; }) !== undefined)) return [3 /*break*/, 3];
                        _a = this;
                        return [4 /*yield*/, this.lmStudioClient.llm.get(modelPath)];
                    case 2:
                        _a.chatModel = _c.sent();
                        logger_1.default.info("Connected to existing LLaMA model.");
                        return [3 /*break*/, 5];
                    case 3:
                        _b = this;
                        return [4 /*yield*/, this.lmStudioClient.llm.load(modelPath, { verbose: false })];
                    case 4:
                        _b.chatModel = _c.sent();
                        logger_1.default.info("LLaMA model loaded.");
                        _c.label = 5;
                    case 5: return [3 /*break*/, 7];
                    case 6:
                        error_2 = _c.sent();
                        logger_1.default.error("Failed to initialize LLaMA model:", error_2);
                        throw error_2;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    LMStudioService.prototype.generate = function (instructions, userPost, history, opts) {
        return __awaiter(this, void 0, void 0, function () {
            var messageChain, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        messageChain = __spreadArray(__spreadArray([
                            {
                                role: "system",
                                content: instructions
                            }
                        ], this.mapPosts(userPost, history), true), [
                            {
                                role: ModelRole.USER,
                                content: userPost.message
                            }
                        ], false);
                        return [4 /*yield*/, this.getChatModel().respond(messageChain, {})];
                    case 1:
                        result = _a.sent();
                        return [2 /*return*/, {
                                message: result.content
                            }];
                }
            });
        });
    };
    LMStudioService.prototype.sendMessageToLLM = function (message, history, seedAssistant, contextWindowLength, maxTokens, schema) {
        return __awaiter(this, void 0, void 0, function () {
            var userMessage, assistantMessage, opts, prediction, finalResult, resultBody, inclSeed;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.chatModel) {
                            throw new Error("LLaMA model is not initialized.");
                        }
                        userMessage = { role: "user", content: message };
                        history.push(userMessage);
                        if (seedAssistant) {
                            assistantMessage = { role: "assistant", content: seedAssistant };
                            history.push(assistantMessage);
                        }
                        opts = { maxPredictedTokens: maxTokens };
                        if (schema) {
                            opts.structured = { type: "json", jsonSchema: schema };
                        }
                        prediction = this.chatModel.respond(history, opts);
                        return [4 /*yield*/, prediction];
                    case 1:
                        finalResult = _a.sent();
                        resultBody = finalResult.content;
                        inclSeed = (resultBody.length > 0 ? ((seedAssistant || "") + resultBody.trim()) : "");
                        // Remove the last message from the history (user's message)
                        return [2 /*return*/, inclSeed];
                }
            });
        });
    };
    LMStudioService.prototype.mapPosts = function (userPost, posts) {
        if (!posts)
            return [];
        return posts.map(function (h) { return ({
            role: h.user_id === userPost.user_id ? ModelRole.USER : ModelRole.ASSISTANT,
            content: h.message
        }); });
    };
    LMStudioService.prototype.sendStructuredRequest = function (message, instructions, history, contextWindowLength, maxTokens) {
        return __awaiter(this, void 0, void 0, function () {
            var systemMessage, userMessage, messageChain, opts, contextLength, tokenCount, i, messageTokens, prediction, finalResult, resultBody;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.chatModel) {
                            throw new Error("LLaMA model is not initialized.");
                        }
                        systemMessage = { role: "system", content: instructions.getPrompt() };
                        userMessage = { role: "user", content: message };
                        messageChain = __spreadArray(__spreadArray([
                            systemMessage
                        ], history || [], true), [
                            userMessage
                        ], false);
                        opts = { structured: { type: "json", jsonSchema: instructions.getSchema() }, maxPredictedTokens: maxTokens };
                        contextLength = parseInt(process.env.CONTEXT_SIZE || "") || contextWindowLength || 4096;
                        tokenCount = 0;
                        i = messageChain.length - 1;
                        _a.label = 1;
                    case 1:
                        if (!(i >= 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.chatModel.unstable_countTokens(messageChain[i].content)];
                    case 2:
                        messageTokens = _a.sent();
                        tokenCount += messageTokens;
                        if (tokenCount > contextLength) {
                            logger_1.default.info("CUTTING TOKENS");
                            messageChain = messageChain.slice(i + 1);
                            return [3 /*break*/, 4];
                        }
                        _a.label = 3;
                    case 3:
                        i--;
                        return [3 /*break*/, 1];
                    case 4:
                        prediction = this.chatModel.respond(messageChain, opts);
                        return [4 /*yield*/, prediction];
                    case 5:
                        finalResult = _a.sent();
                        resultBody = finalResult.content;
                        return [2 /*return*/, json5_1.default.parse(resultBody)];
                }
            });
        });
    };
    LMStudioService.prototype.generateStructured = function (userPost, instructions, history, contextWindowLength, maxTokens) {
        return __awaiter(this, void 0, void 0, function () {
            var systemMessage, userMessage, messageChain, opts, prediction, finalResult, resultBody;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.chatModel) {
                            throw new Error("LLaMA model is not initialized.");
                        }
                        systemMessage = { role: "system", content: instructions.getPrompt() };
                        userMessage = { role: "user", content: userPost.message };
                        messageChain = __spreadArray(__spreadArray([
                            systemMessage
                        ], this.mapPosts(userPost, history), true), [
                            userMessage
                        ], false);
                        opts = { structured: { type: "json", jsonSchema: instructions.getSchema() }, maxPredictedTokens: maxTokens };
                        prediction = this.chatModel.respond(messageChain, opts);
                        return [4 /*yield*/, prediction];
                    case 1:
                        finalResult = _a.sent();
                        resultBody = finalResult.content;
                        return [2 /*return*/, json5_1.default.parse(resultBody)];
                }
            });
        });
    };
    LMStudioService.prototype.getEmbeddingModel = function () {
        if (!this.embeddingModel)
            throw new Error("LMStudioService not initalized");
        return this.embeddingModel;
    };
    LMStudioService.prototype.getChatModel = function () {
        if (!this.chatModel)
            throw new Error("LMStudioService not initalized");
        return this.chatModel;
    };
    return LMStudioService;
}());
exports.default = LMStudioService;
