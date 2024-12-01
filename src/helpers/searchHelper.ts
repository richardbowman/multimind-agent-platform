import axios from 'axios';
import { SEARXNG_URL } from './config';
import Logger from "src/helpers/logger";

class SearchHelper {
    async searchOnSearXNG(query: string, category: string): Promise<{ title: string, url: string, description: string }[]> {
        const encodedQuery = encodeURIComponent(query).replace(/'/g, '%27');
        
        const searchUrl = `${SEARXNG_URL}search?q=${encodedQuery}&category=${category}&format=json`;

        Logger.info(`Searching on SearXNG: ${searchUrl}`);
        try {
            const response = await axios.get(searchUrl);
            return response.data.results.map((result: any) => ({
                title: result.title,
                url: result.url,
                description: result.content?.slice(0, 500)
            }));
        } catch (error) {
            Logger.error(`Error searching on SearXNG for "${query}":`, error);
            return [];
        }
    }
}

export default SearchHelper;