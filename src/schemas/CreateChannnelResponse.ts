export interface CreateChannelResponse {
    /* Channel name starting with # */
    name: string;
    
    /* Channel purpose */
    description: string;
    
    /* Template ID to use */
    templateId: string;
    
    /* Explanation for the channel creation */
    explanation: string;
    
    /* Initial tasks to setup */
    initialTasks: string[];
    
    /* Supporting agents to include */
    supportingAgents: string[];
}
