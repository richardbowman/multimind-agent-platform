export interface ArtifactGenerationResponse {
    /**
     * ID of document to modify (only required for replace/append operations)
     */
    artifactId?: string;

    /**
     * Operation to perform: "create" for new documents, "replace" or "append" for existing ones
     */
    operation: 'create' | 'replace' | 'append';

    /**
     * Title for the document
     */
    title: string;

    /**
     * Content for the document
     */
    content: string;

    /**
     * Message describing what was done
     */
    confirmationMessage: string;
}