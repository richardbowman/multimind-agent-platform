import { ModelResponse } from "./ModelResponse";

export enum SearchCategory {
    General = "general",
    News = "news"
}

export interface SearchQueryResponse extends ModelResponse {
    /**
     * A web search query. For news searches, include relevant keywords
     */
    searchQuery: string;

    /**
     * The search category - use 'news' for current events, otherwise 'general'
     */
    category: SearchCategory;
}
