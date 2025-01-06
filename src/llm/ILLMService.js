"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRole = exports.StructuredOutputPrompt = void 0;
class StructuredOutputPrompt {
    constructor(schema, prompt) {
        this.schema = schema;
        this.prompt = prompt;
    }
    getSchema() {
        return this.schema;
    }
    getPrompt() {
        return this.prompt;
    }
}
exports.StructuredOutputPrompt = StructuredOutputPrompt;
var ModelRole;
(function (ModelRole) {
    ModelRole["USER"] = "user";
    ModelRole["ASSISTANT"] = "assistant";
})(ModelRole || (exports.ModelRole = ModelRole = {}));
