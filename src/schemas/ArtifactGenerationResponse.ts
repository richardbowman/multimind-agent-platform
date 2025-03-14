export interface ArtifactGenerationResponse {
    /** Index of document to modify (required for replace/append operations, must be null/undefined for create) */
    artifactIndex?: number | null;

    /** Operation to perform: "create" for new documents, "replace" or "append" for existing ones */
    operation: 'create' | 'replace' | 'append';

    /** Title for the document */
    title: string;

    /** Artifact subtype */
    subtype: string;
}
