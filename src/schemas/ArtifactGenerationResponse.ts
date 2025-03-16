export type OperationTypes = 'create' | 'replace' | 'patch' | 'append' | 'requestFullContent';

export interface ArtifactGenerationResponse {
    /** 
     * Index of document to modify (required for replace/append operations, must be null/undefined for create)
     * Can be either a numeric index (0-based) or the UUID of the artifact
     */
    artifactIndex?: number | string | null;

    /** Operation to perform, see instructions */
    operation: OperationTypes;

    /** Title for the document */
    title: string;

    /** Artifact subtype */
    subtype: string;
}
