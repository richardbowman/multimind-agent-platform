import { ClientSettings } from './settingsDecorators';
import { MODEL_CONFIG_DEFAULT, ModelProviderConfig } from './modelProviderConfig';
import { PROVIDER_CONFIG_DEFAULT, ProviderConfig } from './providerConfig';

import { PubMedConfig } from './searchSettings/PubMedConfig';
import { DuckDuckGoConfig } from './searchSettings/DuckDuckGoConfig';
import { BraveConfig } from './searchSettings/BraveConfig';


import { LanceDBSettings } from './databaseSettings/LanceDBSettings';
import { SQLiteVecSettings } from './databaseSettings/SQLiteVecSettings';
import { TTSSettings } from './ttsSettings/TTSSettings';


export class Settings {
    @ClientSettings({
        label: 'Providers',
        category: 'Providers',
        type: 'section',
        description: 'Configure provider connections. NOTE: You must hit Save after changing these settings before you can configure Models with new/updated providers.'
    })
    providers: Partial<ProviderConfig>[] = PROVIDER_CONFIG_DEFAULT;

    @ClientSettings({
        label: 'Model Configurations',
        category: 'Models',
        type: 'Models',
        description: 'Configure different model types and their providers'
    })
    modelConfigs: Partial<ModelProviderConfig>[] = MODEL_CONFIG_DEFAULT;

    @ClientSettings({
        label: 'Text-to-Speech',
        category: 'Text-to-Speech',
        type: 'section'
    })
    tts: TTSSettings = new TTSSettings();

    @ClientSettings({
        label: 'Search Provider',
        category: 'Search Settings',
        type: 'select',
        options: ['duckduckgo', 'searxng', 'google', 'brave']
    })
    searchProvider: 'duckduckgo'|'searxng'|'google'|'brave' = 'duckduckgo';

    @ClientSettings({
        label: 'Scraping Provider',
        category: 'Search Settings',
        type: 'select',
        options: ['puppeteer', 'electron']
    })
    scrapingProvider: 'puppeteer'|'electron' = 'electron';

    @ClientSettings({
        label: 'SearXNG URL',
        category: 'Search Settings',
        type: 'string',
        visibleWhen: (settings) => settings.searchProvider === 'searxng'
    })
    searxngUrl: string = 'http://localhost:8080/';

    @ClientSettings({
        label: 'ChromaDB URL',
        category: 'Indexing',
        type: 'string',
        visibleWhen: (settings) => settings.vectorDatabaseType === 'chroma'
    })
    chromadbUrl: string = 'http://localhost:8001';

    @ClientSettings({
        label: 'Database Collection Name',
        category: 'Indexing',
        type: 'string',
        visibleWhen: (settings) => settings.vectorDatabaseType === 'chroma'
    })
    chromaCollection: string = 'core';

    @ClientSettings({
        label: 'Max Link Selections',
        category: 'Search Settings',
        type: 'number'
    })
    maxSelectedLinks: number = 10;

    @ClientSettings({
        label: 'Max Follows',
        category: 'Search Settings',
        type: 'number'
    })
    maxFollows: number = 3;

    @ClientSettings({
        label: 'Max Research Requests',
        category: 'Search Settings',
        type: 'number'
    })
    maxResearchRequests: number = 3;

    @ClientSettings({
        label: 'Webpage Scrape Timeout (seconds)',
        category: 'Search Settings',
        type: 'number'
    })
    pageScrapeTimeout: number = 10;

    @ClientSettings({
        label: 'Display Scraping Browser',
        category: 'Search Settings',
        type: 'boolean'
    })
    displayScrapeBrowser: boolean = false;

    @ClientSettings({
        label: 'UI Theme',
        category: 'UI Settings',
        type: 'select',
        options: ['teal', 'atom-one-dark'],
        description: 'Select the application theme'
    })
    theme: 'teal'|'atom-one-dark' = 'teal';

    @ClientSettings({
        label: 'UI Zoom Level',
        category: 'UI Settings',
        type: 'slider',
        min: 0.5,
        max: 2.0,
        step: 0.1,
        description: 'Adjust the UI zoom level (0.5 = 50%, 1.0 = 100%, 2.0 = 200%)'
    })
    zoom: number = 1.0;

    @ClientSettings({
        label: 'Window Width',
        category: 'UI Settings',
        type: 'slider',
        min: 800,
        max: 2560,
        step: 10,
        description: 'Default window width in pixels'
    })
    windowWidth: number = 1200;

    @ClientSettings({
        label: 'Window Height',
        category: 'UI Settings',
        type: 'slider',
        min: 600,
        max: 1440,
        step: 10,
        description: 'Default window height in pixels'
    })
    windowHeight: number = 800;

    /** not exposed right now */
    host: string = 'localhost';
    port: number = 4001;
    protocol: string = 'ws';
    wsUrl: string = 'ws://localhost:4001';

    @ClientSettings({
        label: 'Simulate Typing on Paste',
        category: 'UI Settings',
        type: 'boolean',
        description: 'Simulate typing when pasting text into the command input'
    })
    simulateTypingOnPaste: boolean = false;

    @ClientSettings({
        label: 'Open Dev Tools on Load',
        category: 'UI Settings',
        type: 'boolean',
        description: 'Automatically open developer tools when window loads'
    })
    openDevToolsOnLoad: boolean = false;

    // Vector DB Settings
    @ClientSettings({
        label: 'Vector Database Type',
        category: 'Indexing',
        type: 'select',
        options: ['vectra', 'chroma', 'sqlite_vec', 'lancedb'],
        description: 'Type of vector database to use for storing and querying embeddings'
    })
    vectorDatabaseType: 'vectra'|'chroma'|'sqlite_vec'|'lancedb' = 'vectra';

    @ClientSettings({
        label: 'SQLiteVec Settings',
        category: 'Indexing',
        type: 'section',
        description: 'Configuration for SQLiteVec vector database',
        visibleWhen: (settings) => settings.vectorDatabaseType === 'sqlite_vec'
    })
    sqliteVec: SQLiteVecSettings = new SQLiteVecSettings();

    @ClientSettings({
        label: 'LanceDB Settings',
        category: 'Indexing',
        type: 'section',
        description: 'Configuration for LanceDB vector database',
        visibleWhen: (settings) => settings.vectorDatabaseType === 'lancedb'
    })
    lancedb: LanceDBSettings = new LanceDBSettings();

    @ClientSettings({
        label: 'DuckDuckGo Settings',
        category: 'Search Settings',
        type: 'section',
        visibleWhen: (settings) => settings.searchProvider === 'duckduckgo'
    })
    duckduckgo: DuckDuckGoConfig = new DuckDuckGoConfig();


    @ClientSettings({
        label: 'Brave Search Settings',
        category: 'Search Settings',
        type: 'section',
        visibleWhen: (settings) => settings.searchProvider === 'brave'
    })
    brave: BraveConfig = new BraveConfig();

    @ClientSettings({
        label: 'PubMed Settings',
        category: 'Search Settings',
        type: 'section'
    })
    pubmed: PubMedConfig = new PubMedConfig();
}
