import puppeteer, { Page } from 'puppeteer';
import { load } from 'cheerio';
import TurndownService from 'turndown';

class ScrapeHelper {
    async scrapePageWithPuppeteer(url: string): Promise<{ content: string, links: { href: string, text: string }[] }> {
        let browser, page : Page, actualUrl: string;
        try {
            browser = await puppeteer.launch({ headless: true });
            page = await browser.newPage();
            // await page.goto(url, { waitUntil: 'networkidle2' });
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded' });
            } catch (error) {
                Logger.warn(`Element 'body' did not load within the specified timeout. Continuing with the current content.`);
            }

            // Wait for additional content to load after scrolling
            await new Promise(resolve => setTimeout(resolve, 1000));

            actualUrl = await page.url();
        

            // Scroll to the bottom of the page
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
                // actualUrl = document.baseURI;
            });

            // Wait for additional content to load after scrolling
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Extract HTML content
            const htmlContent = await page.content();

            // Load the HTML content into Cheerio
            const $ = load(htmlContent);

            // Remove script tags from the body
            // $('body').find('script').remove();

            // Extract main content (excluding boilerplate elements)
            // let content = $('body').text();

            // Remove all script and style elements
            $('script, style').remove();

            // Remove style attributes from all elements
            $('*').removeAttr('style');

            // Convert all relative URLs to absolute
            $('[src], [href]').each((i, element) => {
                ['src', 'href', 'srcset'].forEach(attr => {
                    const value = element.attribs[attr];
                    if (!value) return;

                    if (attr === 'srcset') {
                        const newSrcset = value.split(',').map(src => {
                            const [url, size] = src.trim().split(' ');
                            try {
                                const absoluteUrl = new URL(url, actualUrl).href;
                                return `${absoluteUrl}${size ? ' ' + size : ''}`;
                            } catch (e) {
                                return src;
                            }
                        }).join(', ');
                        element.attribs[attr] = newSrcset;
                    } else if (!value.startsWith('http') && !value.startsWith('data:') && !value.startsWith('#') && !value.startsWith('//')) {
                        try {
                            const absoluteUrl = new URL(value, actualUrl).href;
                            element.attribs[attr] = absoluteUrl;
                        } catch (e) {
                            Logger.warn(`Failed to process ${attr} URL:`, value, e);
                        }
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


            // Remove extra newlines
            // content = content.replace(/\n\s*\n/g, '\n');

            // Extract links
            const links: { href: string, text: string }[] = [];
            $('a').each((index, element) => {
                const href = $(element).attr('href');
                const text = $(element).text();
                if (href && text && !href.startsWith("#") && !links.find(l => l.href === href)) {
                    links.push({ href, text });
                }
            });

            return { content: markdownContent, links };
        } catch (error) {
            Logger.error(`Error scraping page "${url}":`, error);
            throw error;
        } finally {
            if (page) await page.close();
            if (browser) await browser.close();
        }
    }
}

export default ScrapeHelper;