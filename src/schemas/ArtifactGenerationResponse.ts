export interface ArtifactGenerationResponse {
    /** Index of document to modify (required for replace/append operations, must be null/undefined for create) */
    artifactIndex?: number | null;

    /** Operation to perform, see instructions */
    operation: 'create' | 'replace' | 'patch' | 'append';

    /** Title for the document */
    title: string;

    /** Artifact subtype */
    subtype: string;
}
