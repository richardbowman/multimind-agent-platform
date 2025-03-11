import { ExecutorType } from "../interfaces/ExecutorType";
import { Artifact, CalendarArtifact, CalendarEvent } from "../../tools/artifact";
import ical from 'ical-generator';
import { parse } from 'ical-parser';
import { HandlerParams } from "../agents";
import { ModelHelpers } from "../../llm/modelHelpers";
import { StructuredOutputPrompt } from "../../llm/ILLMService";
import { SchemaType } from "../../schemas/SchemaTypes";
import { ChatPost } from "../../chat/chatClient";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { CalendarResponse } from "src/schemas/CalendarResponse";
import { StepResult, StepResultType } from "../interfaces/StepResult";
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

  async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
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

      prompt.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts||[]});

      prompt.addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses||[]});

      const instructions = new StructuredOutputPrompt(schema, await prompt.build());

      // Generate the structured response
      const response = await this.modelHelpers.generate<CalendarResponse>({
        message: params.stepGoal,
        instructions,
        artifacts: params.context?.artifacts,
      });

      // Create iCalendar content
      const calendar = ical({
        name: 'Generated Calendar',
        timezone: 'UTC'
      });

      response.events.forEach(event => {
        calendar.createEvent({
          start: event.start,
          end: event.end,
          summary: event.title,
          description: event.description,
          location: event.location,
          attendees: event.attendees?.map(email => ({ email })),
          alarms: event.reminders?.map(reminder => ({
            type: reminder.method === 'email' ? 'email' : 'display',
            trigger: reminder.minutesBefore * 60
          }))
        });
      });

      // Generate a title based on the first event or default
      const title = response.events.length > 0 
        ? `Calendar: ${response.events[0].title} and ${response.events.length - 1} more events`
        : 'Generated Calendar';

      // Create the calendar artifact
      const calendarArtifact = await this.artifactManager.saveArtifact({
        type: 'calendar',
        content: calendar.toString(),
        mimeType: 'text/calendar',
        metadata: {
          title: title
        }
      });

      // Return both the confirmation message and the artifact
      return {
        type: StepResultType.Calendar,
        finished: true,
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
