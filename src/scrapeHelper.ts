import puppeteer from 'puppeteer';
import { load } from 'cheerio';

class ScrapeHelper {
    async scrapePageWithPuppeteer(url: string): Promise<{ content: string, links: { href: string, text: string }[] }> {
        let browser, page;
        try {
            browser = await puppeteer.launch({ headless: true });
            page = await browser.newPage();
            // await page.goto(url, { waitUntil: 'networkidle2' });
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded' });
            } catch (error) {
                console.warn(`Element 'body' did not load within the specified timeout. Continuing with the current content.`);
            }

            // Wait for additional content to load after scrolling
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Scroll to the bottom of the page
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });

            // Wait for additional content to load after scrolling
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Extract HTML content
            const htmlContent = await page.content();

            // Load the HTML content into Cheerio
            const $ = load(htmlContent);

            // Remove script tags from the body
            $('body').find('script').remove();

            // Extract main content (excluding boilerplate elements)
            let content = $('body').text();

            // Remove extra newlines
            content = content.replace(/\n\s*\n/g, '\n');

            // Extract links
            const links: { href: string, text: string }[] = [];
            $('a').each((index, element) => {
                const href = $(element).attr('href');
                const text = $(element).text();
                if (href && text && !href.startsWith("#")) {
                    links.push({ href, text });
                }
            });

            return { content, links };
        } catch (error) {
            console.error(`Error scraping page "${url}":`, error);
            throw error;
        } finally {
            if (page) await page.close();
            if (browser) await browser.close();
        }
    }
}

export default ScrapeHelper;