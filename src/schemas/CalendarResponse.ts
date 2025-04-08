import { CalendarEvent } from "../tools/artifact";

export interface CalendarResponse {
  /**
   * Array of calendar events to create/update
   */
  events: CalendarEvent[];
  
  /**
   * The action to perform with these events
   */
  action: 'create' | 'update' | 'delete';
}
