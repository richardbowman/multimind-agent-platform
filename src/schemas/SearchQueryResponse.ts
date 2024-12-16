export interface SearchQueryResponse {
    /**
     * A broad web search query without special keywords or operators
     */
    searchQuery: string;

    /**
     * The search category - use 'news' for current events, otherwise 'general'
     */
    category: "general" | "news";
}
