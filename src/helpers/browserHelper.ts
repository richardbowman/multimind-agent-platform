import { chromium } from 'playwright-extra';
import { Browser, BrowserContext } from 'playwright';
import { BrowserWindow } from 'electron';
import { Settings } from 'src/tools/settings';
import Logger from './logger';

export class BrowserHelper {
    private browser: Browser | null = null;
    private electronWindows: BrowserWindow[] = [];
    private electronWindowPool: BrowserWindow[] = [];
    private activeWindows: Set<BrowserWindow> = new Set();
    private settings: Settings;

    constructor(settings: Settings) {
        this.settings = settings;
    }

    async getContext(): Promise<BrowserContext | BrowserWindow> {
        if (this.settings.scrapingProvider === 'electron') {
            return this.getElectronWindow();
        }
        return this.getPlaywrightContext();
    }

    private async getPlaywrightContext(): Promise<BrowserContext> {
        if (!this.browser) {
            this.browser = await chromium.launch({ 
                headless: !this.settings.displayScrapeBrowser,
                args: [
                    '--disable-dev-shm-usage',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            });
        }
        return this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
    }

    private async getElectronWindow(): Promise<BrowserWindow> {
        let window = this.electronWindowPool.pop();
        if (!window || window.isDestroyed()) {
            window = new BrowserWindow({
                width: 1920,
                height: 1080,
                webPreferences: {
                    webSecurity: false,
                    contextIsolation: false,
                    webviewTag: true,
                    nodeIntegration: false,
                    sandbox: true
                },
                show: this.settings.displayScrapeBrowser
            });
            this.electronWindows.push(window);
        }
        this.activeWindows.add(window);
        return window;
    }

    async releaseContext(context: BrowserContext | BrowserWindow): Promise<void> {
        if (this.settings.scrapingProvider === 'electron' && context instanceof BrowserWindow) {
            this.activeWindows.delete(context);
            if (!context.isDestroyed()) {
                this.electronWindowPool.push(context);
            }
        } else if (context instanceof BrowserContext) {
            await context.close();
        }
    }

    async cleanup(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        
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
    }
}
