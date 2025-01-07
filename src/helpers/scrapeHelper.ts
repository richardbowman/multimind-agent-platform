import { chromium, devices, Browser } from 'playwright-extra';
import TurndownService from 'turndown';
import { CheerioAPI, load } from 'cheerio';
import { ArtifactManager } from '../tools/artifactManager';
import crypto from 'crypto';

// Load the stealth plugin and use defaults (all tricks to hide playwright usage)
// Note: playwright-extra is compatible with most puppeteer-extra plugins
import { createStealth } from 'puppeteer-extra-plugin-stealth';
import Logger from './logger';

// Create and add the stealth plugin
const stealth = createStealth();
chromium.use(stealth);

class ScrapeHelper {
    private browser: Browser | null = null;
    private artifactManager: ArtifactManager;

    constructor(artifactManager: ArtifactManager) {
        this.artifactManager = artifactManager;
    }

    async initialize(): Promise<void> {
        if (!this.browser) {
            this.browser = await chromium.launch({ headless: true });
        }
    }

    async cleanup(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
    async scrapePage(url: string, metadata: Record<string, any> = {}): Promise<{ content: string, links: { href: string, text: string }[], title: string, screenshot: Buffer, artifactId: string }> {
        if (!this.browser) {
            await this.initialize();
        }

        let page;
        try {
            const context = await this.browser!.newContext({
                javaScriptEnabled: true,
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1920, height: 1080 },
                deviceScaleFactor: 1,
                isMobile: false,
                hasTouch: false,
            });
            page = await context.newPage();

            // Navigate to the URL and wait for network idle
            try {
                await page.goto(url, { 
                    waitUntil: 'networkidle',
                    timeout: 5000 
                });
            } catch (error) {
                Logger.warn(`Element 'body' did not load within the specified timeout. Continuing with the current content.`);
            }

            // Wait for additional content to load after scrolling
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Take a full-page screenshot
            let screenshot: Buffer = Buffer.from('');
            try {
                screenshot = await page.screenshot({ fullPage: true });
            } catch (error) {
                Logger.warn(`Couldn't get a screenshot.`);
            }


            const actualUrl = page.url();

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

            // Extract HTML content
            const htmlContent = await page.content();

            // Extract the title of the page
            const title = await page.title();

            // Load the HTML content into Cheerio
            const $ = load(htmlContent);

            const markdownContent = convertPageToMarkdown($, actualUrl);

            // Extract links
            const links: { href: string, text: string }[] = [];
            $('a').each((index, element) => {
                const href = $(element).attr('href');
                const text = $(element).text();
                if (href && text && !href.startsWith("#") && !links.find(l => l.href === href)) {
                    links.push({ href, text });
                }
            });

            // Save the full webpage content as an artifact
            const artifactId = crypto.randomUUID();
            await this.artifactManager.saveArtifact({
                id: artifactId,
                type: 'webpage',
                content: markdownContent,
                metadata: {
                    url,
                    title,
                    scrapedAt: new Date().toISOString(),
                    ...metadata
                }
            });

            return { content: markdownContent, links, title, screenshot, artifactId };
        } catch (error) {
            Logger.error(`Error scraping page "${url}":`, error);
            throw error;
        } finally {
            if (page) await page.close();
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
    $('*').each(function() {
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

    const fullHtmlWithoutIndentation = (cleanedHtml||"")
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
        replacement: function(content) {
            return content.trim() ? '\n\n' + content + '\n\n' : '';
        }
    });

    
    // Configure link formatting
    turndownService.addRule('links', {
        filter: 'a',
        replacement: function(content, node: Node, options) {
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
