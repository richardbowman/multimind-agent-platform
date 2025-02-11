import axios from 'axios';
import Logger from "src/helpers/logger";
import { chromium, PlaywrightBrowserLauncher } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { ArtifactManager } from '../tools/artifactManager';
import crypto from 'crypto';
import { load } from 'cheerio';
import { convertPageToMarkdown } from './scrapeHelper';
import { Settings } from 'src/tools/settingsManager';
import { Browser } from 'puppeteer';

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

export class BraveSearchProvider implements ISearchProvider {
    private settings: Settings;

    constructor(settings: Settings) {
        this.settings = settings;
    }

    async search(query: string, category: string): Promise<SearchResult[]> {
        try {
            const endpoint = category === 'news' 
                ? 'https://api.search.brave.com/res/v1/news/search'
                : this.settings.brave.endpoint;

            const response = await axios.get(endpoint, {
                params: {
                    q: query,
                    count: 10
                },
                headers: {
                    'Accept': 'application/json',
                    'X-Subscription-Token': this.settings.brave.apiKey
                }
            });

            const results = category === 'news' 
                ? response.data.news?.results || []
                : response.data.web?.results || [];

            return results.map((result: any) => ({
                title: result.title,
                url: result.url || result.news_url,
                description: result.description || result.snippet
            }));
        } catch (error) {
            Logger.error(`Error searching Brave for "${query}":`, error);
            return [];
        }
    }
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

export class DuckDuckGoProvider implements ISearchProvider {
    private browser?: Browser;
    private artifactManager: ArtifactManager;
    private settings: Settings;

    constructor(artifactManager: ArtifactManager, settings: Settings) {
        this.artifactManager = artifactManager;
        this.settings = settings;
    }

    private async initBrowser() {
        if (!this.browser) {
            this.browser = await chromium.launch({
                headless: this.settings.duckduckgo.headless,
                timeout: this.settings.duckduckgo.timeout
            });
        }
    }

    async search(query: string, category: string): Promise<SearchResult[]> {
        // Only initialize browser when actually searching
        if (!this.browser) {
            await this.initBrowser();
        }
        const results: SearchResult[] = [];

        try {
            const context = await this.browser!.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            const page = await context.newPage();
            const encodedQuery = encodeURIComponent(query);
            const searchUrl = category === 'news' 
                ? `https://duckduckgo.com/?t=h_&q=${encodedQuery}&iar=news&ia=news`
                : `https://duckduckgo.com/?q=${encodedQuery}`;
            await page.goto(searchUrl);

            await page.waitForLoadState('networkidle');

            // Save the page content as an artifact
            const htmlContent = await page.content();

            // Extract the title of the page
            const title = await page.title();
            const actualUrl = page.url();

            // Load the HTML content into Cheerio
            const $ = load(htmlContent);
            const markdownContent = convertPageToMarkdown($, actualUrl);

            const artifactId = crypto.randomUUID();
            await this.artifactManager.saveArtifact({
                id: artifactId,
                type: 'webpage',
                content: markdownContent,
                metadata: {
                    query,
                    category,
                    url: page.url(),
                    title,
                    searchedAt: new Date().toISOString()
                }
            });
            Logger.info(`Saved DuckDuckGo search page as artifact: ${artifactId}`);

            // Find the main results container and extract results
            const mainResults = await page.$('.react-results--main') || await page.$('.results--main');
            if (!mainResults) {
                Logger.warn('Could not find main results container');
                return results;
            }
            const searchResults = await mainResults.$$('[data-testid="result"]') || await mainResults.$$('.result');
            Logger.info(`Found ${searchResults.length} results on page`);

            for (const result of searchResults) {
                try {
                    const titleElement = await result.$('[data-testid="result-title-a"]') || await result.$('.result__title');
                    const linkElement = await result.$('[data-testid="result-extras-url-link"]')  || await result.$('.result__a');
                    const snippetElement = await result.$('[data-result="snippet"]')  || await result.$('.result__snippet');

                    if (titleElement && linkElement) {
                        const title = await titleElement.innerText();
                        const url = await linkElement.getAttribute('href') || '';
                        const description = snippetElement ? (await snippetElement.innerText()).replace(/\s+/g, ' ').trim() : '';

                        if (url.startsWith('http')) {
                            results.push({
                                title,
                                url,
                                description
                            });
                        }
                    }
                } catch (error) {
                    Logger.warn('Error parsing search result:', {
                        error,
                        elementHTML: await result.innerHTML()
                    });
                }
            }

            await page.close();
            await context.close();

        } catch (error) {
            Logger.error(`Error searching DuckDuckGo for "${query}":`, error);
        }

        return results;
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
            this.browser = undefined;
        }
    }
}

class SearchHelper {
    private provider: ISearchProvider;
    private settings: Settings;

    constructor(provider: ISearchProvider, settings: Settings) {
        this.provider = provider;
        this.settings = settings;
    }

    async search(query: string, category: string): Promise<SearchResult[]> {
        try {
            Logger.info(`Using search provider: ${this.settings.searchProvider}`);
            return this.provider.search(query, category);
        } catch (error) {
            Logger.error(`Search failed with provider ${this.settings.searchProvider}:`, error);
            throw error;
        }
    }

    static create(settings: Settings, artifactManager: ArtifactManager): SearchHelper {
        let provider: ISearchProvider;
        switch (settings.searchProvider) {
            case 'duckduckgo':
                provider = new DuckDuckGoProvider(artifactManager, settings);
                break;
            case 'searxng':
                provider = new SearxNGProvider();
                break;
            case 'brave':
                provider = new BraveSearchProvider(settings);
                break;
            default:
                throw new Error(`Unsupported search provider: ${settings.searchProvider}`);
        }
        return new SearchHelper(provider, settings);
    }
}

export default SearchHelper;
