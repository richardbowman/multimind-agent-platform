/**
 * Response schema for artifact selection operations
 */
export interface ArtifactSelectionResponse {
    /**
     * Array of either 1-based indexes from the provided context, or specific UUID strings of artifact IDs.
     */
    artifactIndexes: number[]|string[];
}
