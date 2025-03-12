import { ContentInput } from "src/llm/ContentTypeDefinitions";
import { OutputInstructionsParams } from "src/llm/promptBuilder";

export interface InputPrompt {
    getInstructions(): Promise<string>|string;
    addInstruction(instruction?: ContentInput): void;
    addContext(context?: ContentInput): void;
    addOutputInstructions(params: OutputInstructionsParams): void;
}
