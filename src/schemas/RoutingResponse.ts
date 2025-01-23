import { ModelResponse } from './ModelResponse';

/**
 * Response from the RouterAgent when determining how to route a message
 */
export interface RoutingResponse extends ModelResponse {
    /**
     * The selected agent to handle the request
     */
    selectedAgent?: string;
    
    /**
     * Confidence level in the selection (0-1)
     */
    confidence: number;
    
    /**
     * The message to send to the user or transferring agent
     */
    response: string;
    
    /**
     * The next step to take in the conversation
     */
    nextStep: "propose-transfer" | "execute-transfer" | "ask-clarification" | "provide-information" | "start-goal";
    
    /**
     * Metadata about the routing decision
     */
    metadata?: {
        /**
         * Reasons for selecting this agent
         */
        selectionReasons?: string[];
        
        /**
         * Alternative agents considered
         */
        alternatives?: string[];
        
        /**
         * Timestamp of routing decision
         */
        timestamp?: number;
    };
}
