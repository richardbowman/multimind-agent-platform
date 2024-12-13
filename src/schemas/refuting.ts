/**
 * Interface for refuting response
 */
export interface RefutingResponse {
    /**
     * List of potential counterarguments
     */
    counterarguments: string[];

    /**
     * Analysis of the counterarguments
     */
    analysis: string;

    /**
     * Final verdict after considering counterarguments
     */
    finalVerdict: string;
}
