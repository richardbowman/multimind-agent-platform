/**
 * Interface for search query
 */
export interface SearchQuery {
    /**
     * The search query text
     */
    query: string;

    /**
     * Explanation for why this query was chosen
     */
    rationale: string;
}

/**
 * Interface for a key research finding
 */
export interface ResearchFinding {
    /**
     * The main finding or insight
     */
    finding: string;

    /**
     * Sources supporting this finding
     */
    sources: string[];

    /**
     * How relevant this finding is to the goal
     */
    relevance: string;
}

/**
 * Interface for research response
 */
export interface QueriesResponse {
    /**
     * Generated search queries
     */
    queries: SearchQuery[];

    /**
     * Why these searches will help reach the goal
     */
    rationale: string;
}

/**
 * Interface for quick mode queries response
 */
export interface QuickQueriesResponse {
    /**
     * Array of search query strings
     */
    queries: string[];
}

/**
 * Interface for research response
 */
export interface ResearchResponse {
    /**
     * Generated search queries
     */
    queries: SearchQuery[];

    /**
     * Key findings from the research
     */
    keyFindings: ResearchFinding[];

    /**
     * Identified information gaps
     */
    gaps: string[];

    /**
     * Recommendations for next steps
     */
    recommendations: string;
}
