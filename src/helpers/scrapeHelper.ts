import { chromium, devices } from 'playwright-extra';
import type Browser from 'playwright-extra';

import TurndownService from 'turndown';
import { CheerioAPI, load } from 'cheerio';
import { ArtifactManager } from '../tools/artifactManager';
import crypto from 'crypto';

// Load the stealth plugin and use defaults (all tricks to hide playwright usage)
// Note: playwright-extra is compatible with most puppeteer-extra plugins
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import Logger from './logger';
import { Settings } from 'src/tools/settings';

// Add to your Settings class if not already present
export class ScrapingSettings {
    @ClientSettings({
        label: 'Display Scrape Browser',
        category: 'Scraping',
        type: 'boolean',
        description: 'Show the browser window during scraping'
    })
    displayScrapeBrowser: boolean = false;

    @ClientSettings({
        label: 'Page Scrape Timeout',
        category: 'Scraping',
        type: 'number',
        description: 'Timeout in seconds for page scraping'
    })
    pageScrapeTimeout: number = 30;

    @ClientSettings({
        label: 'Scraping Provider',
        category: 'Scraping',
        type: 'select',
        options: ['puppeteer', 'electron'],
        description: 'Which browser provider to use for scraping'
    })
    scrapingProvider: string = 'puppeteer';
}

import { BrowserWindow } from "electron";
import { ArtifactType } from 'src/tools/artifact';

// Add stealth plugin
chromium.use(StealthPlugin());

export interface LinkRef {
    readonly href: string;
    readonly text: string;
}

class ScrapeHelper {
    private browser: Browser | null = null;
    private artifactManager: ArtifactManager;
    private settings: Settings;
    private electronWindows: BrowserWindow[] = [];
    private electronWindowPool: BrowserWindow[] = [];
    private activeWindows: Set<BrowserWindow> = new Set();
    private activeTabs: Set<any> = new Set(); // Track active tabs
    private tabPool: any[] = []; // Pool of available tabs

    constructor(artifactManager: ArtifactManager, settings: Settings) {
        this.artifactManager = artifactManager;
        this.settings = settings;
    }

    async initialize(): Promise<void> {
        // Only initialize browser when actually scraping
        if (this.settings.scrapingProvider === 'puppeteer' && !this.browser) {
            this.browser = await chromium.launch({ 
                headless: true,
                args: [
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            });
            
            // Initialize tab pool
            for (let i = 0; i < 10; i++) {
                const context = await this.browser.newContext({
                    javaScriptEnabled: true,
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    viewport: { width: 1920, height: 1080 },
                    deviceScaleFactor: 1,
                    isMobile: false,
                    hasTouch: false,
                });
                this.tabPool.push(context);
            }
        }
        
        if (this.settings.scrapingProvider === 'electron' && this.electronWindows.length === 0) {
            // Create pool of 3 Electron windows for parallel scraping
            for (let i = 0; i < 10; i++) {
                const window = new BrowserWindow({
                    width: 1920,
                    height: 1080,
                    webPreferences: {
                        webSecurity: false
                    },
                    show: this.settings.displayScrapeBrowser
                });
                this.electronWindows.push(window);
                this.electronWindowPool.push(window);
            }
        }
    }

    async cleanup(): Promise<void> {
        try {
            if (this.browser) {
                // Get all open contexts
                const contexts = this.browser.contexts();
                for (const context of contexts) {
                    try {
                        await context.close();
                    } catch (error) {
                        Logger.warn('Error closing browser context:', error);
                    }
                }
                
                // Close the browser
                await this.browser.close();
                this.browser = null;
            }
            
            // Clean up all Electron windows
            for (const window of this.electronWindows) {
                try {
                    if (!window.isDestroyed()) {
                        window.close();
                    }
                } catch (error) {
                    Logger.warn('Error closing Electron window:', error);
                }
            }
            this.electronWindows = [];
            this.electronWindowPool = [];
            this.activeWindows.clear();
        } catch (error) {
            Logger.error('Error during cleanup:', error);
        }
    }
    async scrapePage(url: string, metadata: Record<string, any> = {}): Promise<{ content: string, links: { href: string, text: string }[], title: string, screenshot?: Buffer, artifactId: string }> {
        // Only initialize browser when actually scraping
        if (!this.browser && !this.electronWindow) {
            await this.initialize();
        }

        let page, actualUrl: string, htmlContent: string, title: string, screenshot: Buffer | undefined = undefined;
        let context: any = null;
        try {
            if (this.settings.scrapingProvider === 'puppeteer') {
                // Get a context from the pool or create new one
                context = this.tabPool.pop() || await this.browser!.newContext({
                    javaScriptEnabled: true,
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    viewport: { width: 1920, height: 1080 },
                    deviceScaleFactor: 1,
                    isMobile: false,
                    hasTouch: false,
                });
                
                this.activeTabs.add(context);
                page = await context.newPage();

                // Navigate to the URL and wait for network idle
                try {
                    await page.goto(url, {
                        waitUntil: 'networkidle',
                        timeout: this.settings.pageScrapeTimeout*1000
                    });
                } catch (error) {
                    Logger.warn(`Element 'body' did not load within the specified timeout. Continuing with the current content.`);
                }

                // Wait for additional content to load after scrolling
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Take a full-page screenshot
                try {
                    screenshot = await page.screenshot({ fullPage: true });
                } catch (error) {
                    Logger.warn(`Couldn't get a screenshot.`);
                }

                // Scroll to the bottom of the page with error handling
                await page.evaluate(() => {
                    if (document.body) {
                        window.scrollTo(0, document.body.scrollHeight);
                    }
                }).catch(error => {
                    Logger.warn('Could not scroll page, continuing anyway:', error);
                });

                // Wait for additional content to load after scrolling
                await new Promise(resolve => setTimeout(resolve, 1000));

                actualUrl = page.url();
                htmlContent = await page.content();
                title = await page.title();
            } else if (this.settings.scrapingProvider === 'electron') {
                // Get a window from the pool or create new one
                let window: BrowserWindow | null = this.electronWindowPool.pop() || null;
                
                // Create new window if pool is empty or window is destroyed
                if (!window || window.isDestroyed()) {
                    window = new BrowserWindow({
                        width: 1920,
                        height: 1080,
                        webPreferences: {
                            webSecurity: false,
                            // Add more webPreferences to make it look like a real browser
                            contextIsolation: false,
                            webviewTag: true,
                            nodeIntegration: false,
                            sandbox: true
                        },
                        show: this.settings.displayScrapeBrowser
                    });

                    // Set user agent to mimic a real Chrome browser
                    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
                    window.webContents.setUserAgent(userAgent);

                    // Set additional headers to make it look like a real browser
                    window.webContents.session.webRequest.onBeforeSendHeaders((details, callback) => {
                        details.requestHeaders['Accept-Language'] = 'en-US,en;q=0.9';
                        details.requestHeaders['Sec-Ch-Ua'] = '"Not_A Brand";v="8", "Chromium";v="120"';
                        details.requestHeaders['Sec-Ch-Ua-Mobile'] = '?0';
                        details.requestHeaders['Sec-Ch-Ua-Platform'] = '"Windows"';
                        callback({ requestHeaders: details.requestHeaders });
                    });
                    this.electronWindows.push(window);
                }
                
                this.activeWindows.add(window);
                const webContents = window.webContents;

                // Wait for DOM ready with timeout fallback
                await Promise.race([
                    new Promise<void>(resolve => webContents.once('dom-ready', resolve)),
                    new Promise<void>((_, reject) => setTimeout(() => reject(new Error('DOM ready timeout')), this.settings.pageScrapeTimeout*1000))
                ]).catch(error => {
                    Logger.warn(`DOM ready event timed out for ${url}:`, error);
                });

                try {
                    // First load a blank page to initialize the browser context
                    await window.loadURL('about:blank');
                    
                    // Then load the actual URL with additional headers
                    await window.loadURL(url, {
                        extraHeaders: `
                            Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8
                            Accept-Encoding: gzip, deflate, br
                            Accept-Language: en-US,en;q=0.9
                            Cache-Control: no-cache
                            Pragma: no-cache
                            Sec-Fetch-Dest: document
                            Sec-Fetch-Mode: navigate
                            Sec-Fetch-Site: none
                            Sec-Fetch-User: ?1
                            Upgrade-Insecure-Requests: 1
                        `
                    });

                    // Wait for page to fully load
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (e) {
                    Logger.error(`Failed to load URL in Electron: ${url}`, e);
                }

                actualUrl = webContents.getURL();
                htmlContent = await webContents.executeJavaScript('document.body.innerHTML');
                title = await webContents.executeJavaScript('document.title');

                // Clean up window
                try {
                    if (window && !window.isDestroyed()) {
                        this.activeWindows.delete(window);
                        this.electronWindowPool.push(window);
                    }
                } catch (error) {
                    Logger.warn('Error returning Electron window to pool:', error);
                    if (window && !window.isDestroyed()) {
                        window.close();
                    }
                }
            } else {
                throw new Error(`Unsupported scraping provder ${this.settings.scrapingProvider}`)
            }

            // Load the HTML content into Cheerio
            const $ = load(htmlContent);

            const markdownContent = convertPageToMarkdown($, actualUrl);

            // Extract links
            const links: LinkRef[] = [];
            $('a').each((index, element) => {
                const href = $(element).attr('href');
                const text = $(element).text();
                if (href && text && !href.startsWith("#") && !links.find(l => l.href === href)) {
                    links.push({ href, text });
                }
            });

            // Validate content before saving
            if (!markdownContent) {
                throw new Error(`Failed to extract content from ${url}`);
            }

            // Save the full webpage content as an artifact
            const artifact = await this.artifactManager.saveArtifact({
                type: ArtifactType.Webpage,
                content: markdownContent,
                metadata: {
                    url,
                    title,
                    scrapedAt: new Date().toISOString(),
                    ...metadata
                }
            });

            return { content: markdownContent, links, title, screenshot, artifactId: artifact.id };

        } catch (error) {
            Logger.error(`Error scraping page "${url}":`, error);
            throw error;
        } finally {
            if (this.settings.scrapingProvider === 'puppeteer') {
                if (page) {
                    try {
                        await page.close();
                    } catch (error) {
                        Logger.warn('Error closing page:', error);
                    }
                }
                
                if (context) {
                    try {
                        this.activeTabs.delete(context);
                        // Return context to pool if it's still valid
                        if (!context.isClosed()) {
                            this.tabPool.push(context);
                        }
                    } catch (error) {
                        Logger.warn('Error returning context to pool:', error);
                    }
                }
            } else if (this.settings.scrapingProvider === 'electron') {
                // Clean up any stray windows
                for (const window of this.electronWindows) {
                    try {
                        if (window && !window.isDestroyed()) {
                            if (!this.activeWindows.has(window)) {
                                window.close();
                            }
                        }
                    } catch (error) {
                        Logger.warn('Error closing Electron window:', error);
                    }
                }
                // Clear window collections
                this.electronWindows = [];
                this.electronWindowPool = [];
                this.activeWindows.clear();
            }
        }
    }

    public normalizeUrl(baseUrl: string, childUrl: string): string {
        try {
            return new URL(childUrl, baseUrl).href;
        } catch (error) {
            Logger.error(`Error normalizing URL "${childUrl}" with base "${baseUrl}":`, error);
            throw error;
        }
    }
}

export default ScrapeHelper;


export function convertPageToMarkdown($: CheerioAPI, url: string): string {
    // Remove unwanted elements and attributes
    $('script, style, iframe, noscript, svg, img').remove();

    // Remove all style-related attributes
    $('*').each((_, el) => {
        const attrs = el.attributes;
        const removeAttrs = [];
        for (let i = 0; i < attrs.length; i++) {
            const attr = attrs[i];
            if (['style', 'class', 'id', 'tabindex', 'aria-hidden'].includes(attr.name)) {
                removeAttrs.push(attr.name);
            }
        }
        removeAttrs.forEach(attr => $(el).removeAttr(attr));
    });

    // Remove empty elements
    $('*').each(function () {
        if ($(this).text().trim() === '' && !$(this).find('img').length) {
            $(this).remove();
        }
    });

    // Convert all relative URLs to absolute
    $('[src], [href]').each((i, element) => {
        ['src', 'href'].forEach(attr => {
            const value = $(element).attr(attr);
            if (!value) return;

            try {
                // Handle relative URLs that start with "/"
                if (value.startsWith('/')) {
                    const baseUrl = new URL(url);
                    const absoluteUrl = `${baseUrl.protocol}//${baseUrl.host}${value}`;
                    $(element).attr(attr, absoluteUrl);
                } else {
                    // Use the page's URL as the base for other relative URLs
                    const absoluteUrl = new URL(value, url).toString();
                    $(element).attr(attr, absoluteUrl);
                }
            } catch (e) {
                // Log the error but don't modify the original URL
                Logger.warn(`Skipping invalid ${attr} URL: ${value}`);
            }
        });
    });

    // Get the modified HTML without scripts, styles, and style attributes
    const cleanedHtml = $('body').html();

    const fullHtmlWithoutIndentation = (cleanedHtml || "")
        .replace(/\t/g, '') // Remove tabs
        .replace(/^[ \t]+/gm, ''); // Remove leading spaces and tabs from each line

    const turndownService = new TurndownService({
        linkStyle: 'referenced',
        linkReferenceStyle: 'collapsed',
        headingStyle: 'atx',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced'
    });

    // Add custom rules
    turndownService.addRule('removeEmptyParagraphs', {
        filter: ['p', 'div', 'span'],
        replacement: function (content) {
            return content.trim() ? '\n\n' + content + '\n\n' : '';
        }
    });


    // Configure link formatting
    turndownService.addRule('links', {
        filter: 'a',
        replacement: function (content, node: Node, options) {
            const element = node as HTMLElement;
            const href = element.getAttribute('href');
            const title = element.getAttribute('title');
            if (href === null) {
                return content;
            }
            // Normalize the content: remove newlines and excessive spaces
            const normalizedContent = content
                .replace(/\s+/g, ' ')  // Replace multiple spaces/newlines with single space
                .trim();               // Remove leading/trailing whitespace

            const titlePart = title ? ` "${title.replace(/\s+/g, ' ').trim()}"` : '';
            return `[${normalizedContent}](${href}${titlePart})`;
        }
    });

    return turndownService.turndown(fullHtmlWithoutIndentation);
}
