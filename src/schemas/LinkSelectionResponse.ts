export interface LinkSelectionResponse {
    /**
     * Array of selected links that are relevant to the research goal
     */
    links: {
        /**
         * The URL of the link
         */
        href: string;
        
        /**
         * The visible text of the link
         */
        text: string;
    }[];
}
