import { ExecutorType } from "../interfaces/ExecutorType";
import { Artifact, CalendarArtifact, CalendarEvent } from "../../tools/artifact";
import { HandlerParams } from "../agents";
import { ModelHelpers } from "../../llm/modelHelpers";
import { StructuredOutputPrompt } from "../../llm/ILLMService";
import { getGeneratedSchema, SchemaType } from "../../schemas/SchemaTypes";
import { ChatPost } from "../../chat/chatClient";

interface CalendarResponse {
  events: CalendarEvent[];
  action: 'create' | 'update' | 'delete';
  confirmationMessage: string;
}

export class CalendarExecutor {
  private modelHelpers: ModelHelpers;

  constructor(modelHelpers: ModelHelpers) {
    this.modelHelpers = modelHelpers;
  }

  async execute(params: HandlerParams): Promise<CalendarArtifact | string> {
    try {
      // Get the schema for structured output
      const schema = await getGeneratedSchema(SchemaType.CalendarResponse);
      
      // Create the structured prompt
      const systemPrompt = `You are a calendar management assistant. Your job is to:
1. Create new calendar events based on user requests
2. Modify existing events when requested
3. Delete events when requested
4. Always confirm changes with the user before applying them`;

      const instructions = new StructuredOutputPrompt(schema, systemPrompt);

      // Generate the structured response
      const response = await this.modelHelpers.generate<CalendarResponse>({
        message: params.userPost.message,
        instructions,
        artifacts: params.artifacts,
      });

      // Create the calendar artifact
      const calendarArtifact: CalendarArtifact = {
        id: crypto.randomUUID(),
        type: 'calendar',
        content: response.events,
        mimeType: 'application/json',
      };

      // Return both the confirmation message and the artifact
      return {
        message: response.confirmationMessage,
        artifact: calendarArtifact,
      };
    } catch (error) {
      console.error('Error in CalendarExecutor:', error);
      return 'Sorry, I encountered an error while processing your calendar request.';
    }
  }
}
