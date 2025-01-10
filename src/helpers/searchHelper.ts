import axios from 'axios';
import { SEARXNG_URL } from './config';
import Logger from "src/helpers/logger";
import { Browser, chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { ArtifactManager } from '../tools/artifactManager';
import crypto from 'crypto';
import { load } from 'cheerio';
import { convertPageToMarkdown } from './scrapeHelper';

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

export class DuckDuckGoProvider implements ISearchProvider {
    private browser: Browser | null = null;
    private artifactManager: ArtifactManager;

    constructor(artifactManager: ArtifactManager) {
        this.artifactManager = artifactManager;
    }

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
        await this.initBrowser();
        const results: SearchResult[] = [];

        try {
            const context = await this.browser!.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            });

            const page = await context.newPage();
            const encodedQuery = encodeURIComponent(query);
            await page.goto(`https://duckduckgo.com/?q=${encodedQuery}`);
            
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
            const mainResults = await page.$('.react-results--main');
            if (!mainResults) {
                Logger.warn('Could not find main results container');
                return results;
            }
            const searchResults = await mainResults.$$('[data-testid="result"]');
            Logger.info(`Found ${searchResults.length} results on page`);
            
            for (const result of searchResults) {
                try {
                    const titleElement = await result.$('[data-testid="result-title-a"]');
                    const linkElement = await result.$('[data-testid="result-extras-url-link"]');
                    const snippetElement = await result.$('[data-result="snippet"]');

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
            this.browser = null;
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
                provider = new DuckDuckGoProvider(artifactManager);
                break;
            case 'searxng':
                provider = new SearxNGProvider();
                break;
            default:
                throw new Error(`Unsupported search provider: ${settings.searchProvider}`);
        }
        return new SearchHelper(provider, settings);
    }
}

export default SearchHelper;
