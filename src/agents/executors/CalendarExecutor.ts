import { ExecutorType } from "../interfaces/ExecutorType";
import { Artifact, CalendarArtifact, CalendarEvent } from "../../tools/artifact";
import { HandlerParams } from "../agents";
import { ModelHelpers } from "../../llm/modelHelpers";
import { StructuredOutputPrompt } from "../../llm/ILLMService";
import { SchemaType } from "../../schemas/SchemaTypes";
import { ChatPost } from "../../chat/chatClient";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { CalendarResponse } from "src/schemas/CalendarResponse";
import { StepResult } from "../interfaces/StepResult";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { StepExecutor } from "../interfaces/StepExecutor";
import { ArtifactManager } from "src/tools/artifactManager";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { message } from "blessed";
import { ContentType, PromptBuilder } from "src/llm/promptBuilder";

@StepExecutorDecorator(ExecutorType.CALENDAR_MANAGEMENT, 'Create and update a calendar', true)
export class CalendarExecutor implements StepExecutor {
  private modelHelpers: ModelHelpers;
  private artifactManager: ArtifactManager;

  constructor(params: ExecutorConstructorParams) {
    this.modelHelpers = params.modelHelpers;
    this.artifactManager = params.artifactManager;
  }

  async execute(params: ExecuteParams): Promise<StepResult> {
    try {
      // Get the schema for structured output
      const schema = await getGeneratedSchema(SchemaType.CalendarResponse);

      // Create the structured prompt
      const prompt = this.modelHelpers.createPrompt();
      prompt.addInstruction(`You are a calendar management assistant. Your job is to:
1. Create new calendar events based on user requests
2. Modify existing events when requested
3. Delete events when requested
4. Always confirm changes with the user before applying them`);

      prompt.addContent(ContentType.ARTIFACTS, params.context?.artifacts);

      prompt.addContent(ContentType.STEP_RESULTS, params.previousResult);

      const instructions = new StructuredOutputPrompt(schema, prompt.build());

      // Generate the structured response
      const response = await this.modelHelpers.generate<CalendarResponse>({
        message: params.stepGoal,
        instructions,
        artifacts: params.context?.artifacts,
      });

      // Create the calendar artifact
      const calendarArtifact = await this.artifactManager.saveArtifact({
        type: 'calendar',
        content: JSON.stringify(response.events, null, 2),
        mimeType: 'application/json',
      });

      // Return both the confirmation message and the artifact
      return {
        response: {
          message: response.confirmationMessage,
        },
        artifactIds: [calendarArtifact.id],
      };
    } catch (error) {
      console.error('Error in CalendarExecutor:', error);
      throw error;
    }
  }
}
