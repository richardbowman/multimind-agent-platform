import axios from 'axios';
import { SEARXNG_URL } from './config';
import Logger from "src/helpers/logger";
import { Browser, chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';

// Add stealth plugin to avoid detection
chromium.use(stealth())

export interface SearchResult {
    title: string;
    url: string;
    description: string;
}

export interface ISearchProvider {
    search(query: string, category: string): Promise<SearchResult[]>;
}

export class SearxNGProvider implements ISearchProvider {
    async search(query: string, category: string): Promise<SearchResult[]> {
        const encodedQuery = encodeURIComponent(query).replace(/'/g, '%27');
        const searchUrl = `${SEARXNG_URL}search?q=${encodedQuery}&category=${category}&format=json`;

        Logger.info(`Searching on SearXNG: ${searchUrl}`);
        try {
            const response = await axios.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br'
                }
            });
            const { data } = response;
            return data.results.map((result: any) => ({
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

export class GoogleSearchProvider implements ISearchProvider {
    private browser: Browser | null = null;

    private async initBrowser() {
        if (!this.browser) {
            this.browser = await chromium.launch({ headless: true });
        }
    }

    async search(query: string, category: string): Promise<SearchResult[]> {
        await this.initBrowser();
        const results: SearchResult[] = [];

        try {
            const context = await this.browser!.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            const page = await context.newPage();
            await page.goto('https://www.google.com');
            
            // Accept cookies if present
            try {
                await page.click('button:has-text("Accept all")');
            } catch (e) {
                // Cookie prompt might not appear
            }

            // Type search query and submit
            await page.fill('input[name="q"]', query);
            await page.press('input[name="q"]', 'Enter');
            await page.waitForLoadState('networkidle');

            // Extract search results
            const searchResults = await page.$$('div.g');
            
            for (const result of searchResults) {
                try {
                    const titleElement = await result.$('h3');
                    const linkElement = await result.$('a');
                    const snippetElement = await result.$('div.VwiC3b');

                    if (titleElement && linkElement) {
                        const title = await titleElement.innerText();
                        const url = await linkElement.getAttribute('href') || '';
                        const description = snippetElement ? await snippetElement.innerText() : '';

                        if (url.startsWith('http')) {
                            results.push({
                                title,
                                url,
                                description
                            });
                        }
                    }
                } catch (error) {
                    Logger.warn('Error parsing search result:', error);
                }
            }

            await page.close();
            await context.close();

        } catch (error) {
            Logger.error(`Error searching Google for "${query}":`, error);
        }

        return results;
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

class SearchHelper {
    private provider: ISearchProvider;

    constructor(provider: ISearchProvider = new SearxNGProvider()) {
        this.provider = provider;
    }

    async searchOnSearXNG(query: string, category: string): Promise<SearchResult[]> {
        return this.provider.search(query, category);
    }
}

export default SearchHelper;
