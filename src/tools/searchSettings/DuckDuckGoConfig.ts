import { ClientSettings } from '../settingsDecorators';
import { Settings } from '../settings';

export class DuckDuckGoConfig {
    @ClientSettings({
        label: 'DuckDuckGo Headless Mode',
        category: 'Search Settings',
        type: 'boolean',
        description: 'Run DuckDuckGo searches in headless browser mode',
        visibleWhen: (settings: Settings) => settings.searchProvider === 'duckduckgo'
    })
    headless: boolean = true;

    @ClientSettings({
        label: 'DuckDuckGo Timeout (ms)',
        category: 'Search Settings',
        type: 'number',
        description: 'Timeout for DuckDuckGo search operations',
        visibleWhen: (settings: Settings) => settings.searchProvider === 'duckduckgo'
    })
    timeout: number = 30000;
}
