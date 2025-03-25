import { ClientSettings } from '../settingsDecorators';
import { Settings } from '../settings';

export class BraveConfig {
    @ClientSettings({
        label: 'Brave Search API Key',
        category: 'Search Settings',
        type: 'string',
        sensitive: true,
        description: 'API key for Brave Search',
        visibleWhen: (settings: Settings) => settings.searchProvider === 'brave'
    })
    apiKey: string = '';

    @ClientSettings({
        label: 'Brave Search Endpoint',
        category: 'Search Settings',
        type: 'string',
        description: 'API endpoint for Brave Search',
        visibleWhen: (settings: Settings) => settings.searchProvider === 'brave'
    })
    endpoint: string = 'https://api.search.brave.com/res/v1/web/search';
}
