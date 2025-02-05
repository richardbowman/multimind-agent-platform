import { UUID } from "src/types/uuid";

// src/artifacts/Artifact.ts
export interface CalendarEvent {
  title: string;
  start: Date;
  end: Date;
  description?: string;
  location?: string;
  attendees?: string[];
  reminders?: {
    minutesBefore: number;
    method: 'email' | 'display' | 'audio';
  }[];
  uid?: string;
  url?: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  transparency?: 'opaque' | 'transparent';
}

export interface CalendarArtifact extends Artifact {
  type: ArtifactType.Calendar;
  content: CalendarEvent[];
}

export enum ArtifactType {
  Spreadsheet = "spreadsheet",
  Document = "document",
  Webpage = "webpage",
  Diagram = "diagram",
  Calendar = "calendar",
  ProcedureGuide = "procedure-guide",
  APIData = "api-data"
}

export interface Artifact {
  id: UUID;
  type: ArtifactType; // e.g., 'report', 'draft-email', 'calendar'
  content: string | Buffer | CalendarEvent[]; // The actual data, could be text, binary, or calendar events
  metadata?: Record<string, any>; // Optional additional information about the artifact
  tokenCount?: number; // Optional token count for the content
}
