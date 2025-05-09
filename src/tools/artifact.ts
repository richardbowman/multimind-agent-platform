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
  APIData = "api-data",
  Presentation = "presentation",
  Unknown = "unknown"
}

export enum DocumentSubtype {
  ResearchReport = "Research Report",
  WebpageSummary = "Webpage Summary",
  ScientificPaper = "Scientific Paper",
  Procedure = "Procedure",
  Template = "Template",
  General = "General",
  AgentConfig = "Agent Config"
}

export enum SpreadsheetSubType {
  DataTypes = "Data Types",
  SearchResults = "Search Results",
  EvaluationCriteria = "Evaluation Criteria",
  Template = "Template",
  General = "General",
  Procedure = "Procedure"
}

export interface Artifact extends ArtifactItem {
  content: string | Buffer | CalendarEvent[]; // The actual data, could be text, binary, or calendar events
}

export interface ArtifactItem {
  id: UUID;
  type: ArtifactType;
  metadata?: ArtifactMetadata;
  tokenCount?: number;
}

export interface ArtifactMetadata extends Record<string, any> {
  createdAt?: Date;
  updatedAt?: Date;
  title?: string;
  subtype: DocumentSubtype|SpreadsheetSubType|string;
  description?: string;
  summary?: string;
}
