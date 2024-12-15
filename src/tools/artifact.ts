// src/artifacts/Artifact.ts
export interface Artifact {
  id: string;
  type: string; // e.g., 'report', 'draft-email'
  content: string | Buffer; // The actual data, could be text or binary
  metadata?: Record<string, any>; // Optional additional information about the artifact
  tokenCount?: number; // Optional token count for the content
}
