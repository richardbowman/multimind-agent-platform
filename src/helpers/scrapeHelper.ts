import { chromium, devices } from 'playwright-extra';
import TurndownService from 'turndown';
import { load } from 'cheerio';

// Load the stealth plugin and use defaults (all tricks to hide playwright usage)
// Note: playwright-extra is compatible with most puppeteer-extra plugins
import stealth from 'puppeteer-extra-plugin-stealth';
import Logger from './logger';

// Add the plugin to p@laywright (any number of plugins can be added)
chromium.use(stealth())

class ScrapeHelper {
    async scrapePage(url: string): Promise<{ content: string, links: { href: string, text: string }[], title: string, screenshot: Buffer }> {
        let browser, page;
        try {
            // Launch the browser in headless mode
            browser = await chromium.launch({ headless: true });
            const context = await browser.newContext(); //devices['iPhone 11']
            page = await context.newPage();

            // Navigate to the URL and wait until the DOM content is loaded
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded' });
            } catch (error) {
                Logger.warn(`Element 'body' did not load within the specified timeout. Continuing with the current content.`);
            }

            // Wait for additional content to load after scrolling
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Take a full-page screenshot
            let screenshot: Buffer;
            try {
                screenshot = await page.screenshot({ fullPage: true });
            } catch (error) {
                Logger.warn(`Couldn't get a screenshot.`);
            }


            const actualUrl = page.url();

            // Scroll to the bottom of the page
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });

            // Wait for additional content to load after scrolling
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Extract HTML content
            const htmlContent = await page.content();

            // Extract the title of the page
            const title = await page.title();

            // Load the HTML content into Cheerio
            const $ = load(htmlContent);

            // Remove script tags from the body
            $('script, style, img, iframe').remove();
            $('*').removeAttr('style');

            // Convert all relative URLs to absolute
            $('[src], [href]').each((i, element) => {
                ['src', 'href'].forEach(attr => {
                    const value = $(element).attr(attr);
                    if (!value) return;

                    try {
                        const absoluteUrl = new URL(value, actualUrl).href;
                        $(element).attr(attr, absoluteUrl);
                    } catch (e) {
                        Logger.warn(`Failed to process ${attr} URL:`, value, e);
                    }
                });
            });

            // Get the modified HTML without scripts, styles, and style attributes
            const cleanedHtml = $('body').html();

            const fullHtmlWithoutIndentation = cleanedHtml
                .replace(/\t/g, '') // Remove tabs
                .replace(/^[ \t]+/gm, ''); // Remove leading spaces and tabs from each line

            const turndownService = new TurndownService();
            let markdownContent = turndownService.turndown(fullHtmlWithoutIndentation);

            // Extract links
            const links: { href: string, text: string }[] = [];
            $('a').each((index, element) => {
                const href = $(element).attr('href');
                const text = $(element).text();
                if (href && text && !href.startsWith("#") && !links.find(l => l.href === href)) {
                    links.push({ href, text });
                }
            });

            return { content: markdownContent, links, title, screenshot };
        } catch (error) {
            Logger.error(`Error scraping page "${url}":`, error);
            throw error;
        } finally {
            if (page) await page.close();
            if (browser) await browser.close();
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