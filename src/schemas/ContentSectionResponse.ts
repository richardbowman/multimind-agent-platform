export interface ContentSectionResponse {
    /**
     * The generated content section
     */
    content: string;
    
    /**
     * Citations from search results used in the content
     */
    citations: Array<{
        /**
         * ID of the source artifact
         */
        sourceId: string;
        
        /**
         * Excerpt used from the source
         */
        excerpt: string;
        
        /**
         * Page or section reference if available
         */
        reference?: string;
    }>;
    
    /**
     * Structure of the generated content
     */
    structure: {
        /**
         * Main heading of the section
         */
        heading: string;
        
        /**
         * Subheadings and their content
         */
        subheadings: Array<{
            title: string;
            content: string;
        }>;
    };
    
    /**
     * Token usage metadata
     */
    _usage?: {
        inputTokens: number;
        outputTokens: number;
    };
}
