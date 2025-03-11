export interface ArtifactGenerationResponse {
    /** Index of document to modify (only required for replace/append operations) */
    artifactIndex?: number;

    /** Operation to perform: "create" for new documents, "replace" or "append" for existing ones */
    operation: 'create' | 'replace' | 'append';

    /** Title for the document */
    title: string;

    /** Artifact subtype */
    subtype: string;
}