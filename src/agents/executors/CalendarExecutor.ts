import { ExecutorType } from "../interfaces/ExecutorType";
import ical from 'ical-generator';
import { ModelHelpers } from "../../llm/modelHelpers";
import { SchemaType } from "../../schemas/SchemaTypes";
import { StepExecutorDecorator } from "../decorators/executorDecorator";
import { getGeneratedSchema } from "src/helpers/schemaUtils";
import { CalendarResponse } from "src/schemas/CalendarResponse";
import { StepResponse, StepResult, StepResultType } from "../interfaces/StepResult";
import { ExecutorConstructorParams } from "../interfaces/ExecutorConstructorParams";
import { ArtifactManager } from "src/tools/artifactManager";
import { ExecuteParams } from "../interfaces/ExecuteParams";
import { ContentType, OutputType } from "src/llm/promptBuilder";
import { BaseStepExecutor } from "../interfaces/BaseStepExecutor";
import { StringUtils } from "src/utils/StringUtils";
import { ArtifactType } from "src/tools/artifact";

@StepExecutorDecorator(ExecutorType.CALENDAR_MANAGEMENT, 'Create and update a calendar', true)
export class CalendarExecutor extends BaseStepExecutor<StepResponse> {
  private modelHelpers: ModelHelpers;
  private artifactManager: ArtifactManager;

  constructor(params: ExecutorConstructorParams) {
    super(params);
    this.modelHelpers = params.modelHelpers;
    this.artifactManager = params.artifactManager;
  }

  async execute(params: ExecuteParams): Promise<StepResult<StepResponse>> {
    try {
      // Get the schema for structured output
      const schema = await getGeneratedSchema(SchemaType.CalendarResponse);

      // Create the structured prompt
      const prompt = this.startModel(params);
      prompt.addInstruction(`You are a calendar management assistant. Your job is to:
1. Create new calendar events based on user requests
2. Modify existing events when requested
3. Delete events when requested
4. Always confirm changes with the user before applying them`);

      prompt.addContext({contentType: ContentType.ARTIFACTS_EXCERPTS, artifacts: params.context?.artifacts||[]});

      prompt.addContext({contentType: ContentType.STEP_RESPONSE, responses: params.previousResponses||[]});

      prompt.addOutputInstructions({outputType: OutputType.JSON_WITH_MESSAGE, schema});

      // Generate the structured response
      const rawResponse = await prompt.generate({
        message: params.stepGoal
      });

      const response = StringUtils.extractAndParseJsonBlock<CalendarResponse>(rawResponse.message);
      const message = StringUtils.extractNonCodeContent(rawResponse.message);

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
        type: ArtifactType.Calendar,
        content: calendar.toString(),
        metadata: {
          title: title,
          mimeType: 'text/calendar',
          subtype: 'calendar'
        }
      });

      // Return both the confirmation message and the artifact
      return {
        type: StepResultType.Calendar,
        finished: true,
        response: {
          message
        },
        artifactIds: [calendarArtifact.id],
      };
    } catch (error) {
      console.error('Error in CalendarExecutor:', error);
      throw error;
    }
  }
}
