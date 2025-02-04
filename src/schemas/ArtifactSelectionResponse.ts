/**
 * Response schema for artifact selection operations
 */
export interface ArtifactSelectionResponse {
    /**
     * Array of 1-based indexes indicating which artifacts to select
     * @example [1, 3] // Selects the first and third artifacts from the list
     */
    artifactIndexes: number[];
    
    /**
     * Detailed explanation of why these artifacts were selected
     * @example "Selected these artifacts because they contain the most relevant information about project timelines"
     */
    selectionReason: string;
}
