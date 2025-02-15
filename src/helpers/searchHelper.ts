import axios from 'axios';
import Logger from "src/helpers/logger";
import { chromium } from 'playwright-extra';
import stealth from 'puppeteer-extra-plugin-stealth';
import { ArtifactManager } from '../tools/artifactManager';
import { load } from 'cheerio';
import { convertPageToMarkdown } from './scrapeHelper';
import { ArtifactType } from 'src/tools/artifact';
import { Settings } from 'src/tools/settings';
import { BrowserHelper } from './browserHelper';
import { BrowserWindow } from 'electron';
import { BrowserContext } from 'playwright';

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

            let results: any[] = [];
            if (category === 'news') {
                const newsResponse = response.data as {
                    type: string;
                    query: any;
                    results: {
                        type: string;
                        url: string;
                        title: string;
                        description: string;
                        age: string;
                        page_age: string;
                        page_fetched: string;
                        breaking: boolean;
                        thumbnail: {
                            src: string;
                            original: string;
                        };
                        meta_url: {
                            scheme: string;
                            netloc: string;
                            hostname: string;
                            favicon: string;
                            path: string;
                        };
                        extra_snippets: string[];
                    }[];
                };
                results = newsResponse.results || [];
            } else {
                results = response.data.web?.results || [];
            }

            return results.map((result: any) => ({
                title: result.title,
                url: result.url,
                description: result.description,
                ...(category === 'news' && {
                    age: result.age,
                    isBreaking: result.breaking,
                    thumbnail: result.thumbnail?.src,
                    source: result.meta_url?.hostname
                })
            }));
        } catch (error) {
            Logger.error(`Error searching Brave for "${query}":`, error);
            return [];
        }
    }
}

export class SearxNGProvider implements ISearchProvider {
    private settings: Settings;

    constructor(settings: Settings) {
        this.settings = settings;
    }

    async search(query: string, category: string): Promise<SearchResult[]> {
        const encodedQuery = encodeURIComponent(query).replace(/'/g, '%27');
        const searchUrl = `${this.settings.searxngUrl}search?q=${encodedQuery}&category=${category}&format=json`;

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
    private browserHelper: BrowserHelper;
    private artifactManager: ArtifactManager;
    private settings: Settings;

    constructor(artifactManager: ArtifactManager, settings: Settings) {
        this.artifactManager = artifactManager;
        this.settings = settings;
        this.browserHelper = new BrowserHelper(settings);
    }

    async search(query: string, category: string): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const context = await this.browserHelper.getContext();
        
        try {
            let page;
            if (this.settings.scrapingProvider === 'electron') {
                const window = context as BrowserWindow;
                await window.loadURL('about:blank');
                page = window.webContents;
            } else {
                const playwrightContext = context as BrowserContext;
                page = await playwrightContext.newPage();
            }
            const encodedQuery = encodeURIComponent(query);
            const isNews = category === 'news';
            const searchUrl = isNews
                ? `https://duckduckgo.com/?t=h_&q=${encodedQuery}&iar=news&ia=news`
                : `https://duckduckgo.com/?q=${encodedQuery}`;
            let htmlContent, title, actualUrl;
            if (this.settings.scrapingProvider === 'electron') {
                const window = context as BrowserWindow;
                await window.loadURL(searchUrl);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page to load
                
                htmlContent = await window.webContents.executeJavaScript('document.documentElement.outerHTML');
                title = await window.webContents.executeJavaScript('document.title');
                actualUrl = window.webContents.getURL();
            } else {
                await page.goto(searchUrl);
                await page.waitForLoadState('networkidle');
                
                htmlContent = await page.content();
                title = await page.title();
                actualUrl = page.url();
            }

            // Load the HTML content into Cheerio
            const $ = load(htmlContent);
            const markdownContent = convertPageToMarkdown($, actualUrl);

            const { id: artifactId } = await this.artifactManager.saveArtifact({
                type: ArtifactType.Webpage,
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

            let searchResults;
            if (this.settings.scrapingProvider === 'electron') {
                const window = context as BrowserWindow;
                const mainResults = await window.webContents.executeJavaScript(
                    `Array.from(document.querySelectorAll('${isNews ? '.results--main .result' : '.react-results--main [data-testid="result"]'}'))`
                );
                searchResults = mainResults;
            } else {
                const mainResults = isNews ? await page.$('.results--main') : await page.$('.react-results--main');
                if (!mainResults) {
                    Logger.warn('Could not find main results container');
                    return results;
                }
                searchResults = isNews ? await mainResults.$$('.result') : await mainResults.$$('[data-testid="result"]');
            }
            Logger.info(`Found ${searchResults.length} results on page`);

            for (const result of searchResults) {
                try {
                    let title, url, description;
                    if (this.settings.scrapingProvider === 'electron') {
                        title = await result.querySelector(isNews ? '.result__title' : '[data-testid="result-title-a"]')?.textContent;
                        url = await result.querySelector(isNews ? '.result__a' : '[data-testid="result-extras-url-link"]')?.getAttribute('href') || '';
                        description = await result.querySelector(isNews ? '.result__snippet' : '[data-result="snippet"]')?.textContent?.replace(/\s+/g, ' ').trim() || '';
                    } else {
                        const titleElement = isNews ? await result.$('.result__title') : await result.$('[data-testid="result-title-a"]');
                        const linkElement = isNews ? await result.$('.result__a') : await result.$('[data-testid="result-extras-url-link"]');
                        const snippetElement = isNews ? await result.$('.result__snippet') : await result.$('[data-result="snippet"]');
                        
                        title = await titleElement?.innerText();
                        url = await linkElement?.getAttribute('href') || '';
                        description = snippetElement ? (await snippetElement.innerText()).replace(/\s+/g, ' ').trim() : '';
                    }

                    if (url.startsWith('http')) {
                        results.push({
                            title,
                            url,
                            description
                        });
                    }
                } catch (error) {
                    Logger.warn('Error parsing search result:', {
                        error,
                        elementHTML: await result.innerHTML()
                    });
                }
            }

            await this.browserHelper.releaseContext(context);

        } catch (error) {
            Logger.error(`Error searching DuckDuckGo for "${query}":`, error);
        }

        return results;
    }

    async cleanup() {
        await this.browserHelper.cleanup();
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
                provider = new SearxNGProvider(settings);
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
