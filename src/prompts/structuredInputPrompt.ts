import { ContentInput } from "src/llm/ContentTypeDefinitions";
import { OutputInstructionsParams } from "src/llm/promptBuilder";

export interface InputPrompt {
    getInstructions(): Promise<string>|string;
    addInstruction(instruction?: ContentInput): InputPrompt;
    addContext(context?: ContentInput): InputPrompt;
    addOutputInstructions(params: OutputInstructionsParams): InputPrompt;
}
