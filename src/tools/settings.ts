import { ClientSettings } from './settingsDecorators';
import { MODEL_CONFIG_DEFAULT, ModelProviderConfig } from './modelProviderConfig';
import { PROVIDER_CONFIG_DEFAULT, ProviderConfig } from './providerConfig';

import { PubMedConfig } from './searchSettings/PubMedConfig';
import { DuckDuckGoConfig } from './searchSettings/DuckDuckGoConfig';
import { BraveConfig } from './searchSettings/BraveConfig';


export class TTSSettings {
    @ClientSettings({
        label: 'Voice ID',
        category: 'Text-to-Speech',
        type: 'select',
        options: [
            "ar_JO-kareem-low","ar_JO-kareem-medium","ca_ES-upc_ona-medium","ca_ES-upc_ona-x_low","ca_ES-upc_pau-x_low","cs_CZ-jirka-low","cs_CZ-jirka-medium","cy_GB-gwryw_gogleddol-medium","da_DK-talesyntese-medium","de_DE-eva_k-x_low","de_DE-karlsson-low","de_DE-kerstin-low","de_DE-mls-medium","de_DE-pavoque-low","de_DE-ramona-low","de_DE-thorsten-high","de_DE-thorsten-low","de_DE-thorsten-medium","de_DE-thorsten_emotional-medium","el_GR-rapunzelina-low","en_GB-alan-low","en_GB-alan-medium","en_GB-alba-medium","en_GB-aru-medium","en_GB-cori-high","en_GB-cori-medium","en_GB-jenny_dioco-medium","en_GB-northern_english_male-medium","en_GB-semaine-medium","en_GB-southern_english_female-low","en_GB-vctk-medium","en_US-amy-low","en_US-amy-medium","en_US-arctic-medium","en_US-bryce-medium","en_US-danny-low","en_US-hfc_female-medium","en_US-hfc_male-medium","en_US-joe-medium","en_US-john-medium","en_US-kathleen-low","en_US-kristin-medium","en_US-kusal-medium","en_US-l2arctic-medium","en_US-lessac-high","en_US-lessac-low","en_US-lessac-medium","en_US-libritts-high","en_US-libritts_r-medium","en_US-ljspeech-high","en_US-ljspeech-medium","en_US-norman-medium","en_US-ryan-high","en_US-ryan-low","en_US-ryan-medium","es_ES-carlfm-x_low","es_ES-davefx-medium","es_ES-mls_10246-low","es_ES-mls_9972-low","es_ES-sharvard-medium","es_MX-ald-medium","es_MX-claude-high","fa_IR-amir-medium","fa_IR-gyro-medium","fi_FI-harri-low","fi_FI-harri-medium","fr_FR-gilles-low","fr_FR-mls-medium","fr_FR-mls_1840-low","fr_FR-siwis-low","fr_FR-siwis-medium","fr_FR-tom-medium","fr_FR-upmc-medium","hu_HU-anna-medium","hu_HU-berta-medium","hu_HU-imre-medium","is_IS-bui-medium","is_IS-salka-medium","is_IS-steinn-medium","is_IS-ugla-medium","it_IT-paola-medium","it_IT-riccardo-x_low","ka_GE-natia-medium","kk_KZ-iseke-x_low","kk_KZ-issai-high","kk_KZ-raya-x_low","lb_LU-marylux-medium","ne_NP-google-medium","ne_NP-google-x_low","nl_BE-nathalie-medium","nl_BE-nathalie-x_low","nl_BE-rdh-medium","nl_BE-rdh-x_low","nl_NL-mls-medium","nl_NL-mls_5809-low","nl_NL-mls_7432-low","no_NO-talesyntese-medium","pl_PL-darkman-medium","pl_PL-gosia-medium","pl_PL-mc_speech-medium","pl_PL-mls_6892-low","pt_BR-edresson-low","pt_BR-faber-medium","pt_PT-tugão-medium","ro_RO-mihai-medium","ru_RU-denis-medium","ru_RU-dmitri-medium","ru_RU-irina-medium","ru_RU-ruslan-medium","sk_SK-lili-medium","sl_SI-artur-medium","sr_RS-serbski_institut-medium","sv_SE-nst-medium","sw_CD-lanfrica-medium","tr_TR-dfki-medium","tr_TR-fahrettin-medium","tr_TR-fettah-medium","uk_UA-lada-x_low","uk_UA-ukrainian_tts-medium","vi_VN-25hours_single-low","vi_VN-vais1000-medium","vi_VN-vivos-x_low","zh_CN-huayan-medium","zh_CN-huayan-x_low"
        ],
        description: 'Voice model to use for text-to-speech'
    })
    voiceId: string = 'en_US-amy-medium';

    @ClientSettings({
        label: 'Enable TTS',
        category: 'Text-to-Speech',
        type: 'boolean',
        description: 'Enable text-to-speech for incoming messages'
    })
    enabled: boolean = true;
}

export class LanceDBSettings {
    @ClientSettings({
        label: 'Embedding Dimensions',
        category: 'Indexing',
        type: 'number',
        description: 'Number of dimensions for embeddings (must match embedding model)',
        visibleWhen: (settings) => settings.vectorDatabaseType === 'lancedb'
    })
    dimensions: number = 768;

    @ClientSettings({
        label: 'Auto Vacuum',
        category: 'Indexing',
        type: 'boolean',
        description: 'Enable automatic database vacuuming to optimize storage',
        visibleWhen: (settings) => settings.vectorDatabaseType === 'lancedb'
    })
    autoVacuum: boolean = true;

    @ClientSettings({
        label: 'Journal Mode',
        category: 'Indexing',
        type: 'select',
        options: ['DELETE', 'TRUNCATE', 'PERSIST', 'MEMORY', 'WAL', 'OFF'],
        description: 'SQLite journal mode (WAL recommended for better concurrency)',
        visibleWhen: (settings) => settings.vectorDatabaseType === 'lancedb'
    })
    journalMode: string = 'WAL';
};

export class SQLiteVecSettings{
    @ClientSettings({
        label: 'Embedding Dimensions',
        category: 'Indexing',
        type: 'number',
        description: 'Number of dimensions for embeddings (must match embedding model)',
        visibleWhen: (settings) => settings.vectorDatabaseType === 'sqlite_vec'
    })
    dimensions: number = 768;

    @ClientSettings({
        label: 'Auto Vacuum',
        category: 'Indexing',
        type: 'boolean',
        description: 'Enable automatic database vacuuming to optimize storage',
        visibleWhen: (settings) => settings.vectorDatabaseType === 'sqlite_vec'
    })
    autoVacuum: boolean = true;

    @ClientSettings({
        label: 'Journal Mode',
        category: 'Indexing',
        type: 'select',
        options: ['DELETE', 'TRUNCATE', 'PERSIST', 'MEMORY', 'WAL', 'OFF'],
        description: 'SQLite journal mode (WAL recommended for better concurrency)',
        visibleWhen: (settings) => settings.vectorDatabaseType === 'sqlite_vec'
    })
    journalMode: string = 'WAL';
};


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
        label: 'Agents',
        category: 'Agents',
        type: 'section'
    })
    agents: Record<string, AgentBuilderConfig> = {};

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
