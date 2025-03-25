import { ClientSettings } from '../settingsDecorators';

export class PubMedConfig {
    @ClientSettings({
        label: 'PubMed Max Results',
        category: 'Search Settings',
        type: 'number',
        description: 'Maximum number of results to return from PubMed searches'
    })
    maxResults: number = 10;

    @ClientSettings({
        label: 'PubMed API Email',
        category: 'Search Settings',
        type: 'string',
        description: 'Email address for PubMed API (required for rate limit tracking)'
    })
    apiEmail: string = '';

    @ClientSettings({
        label: 'PubMed API Tool',
        category: 'Search Settings',
        type: 'string',
        description: 'Tool name for PubMed API (required for rate limit tracking)'
    })
    apiTool: string = 'YourAppName';
}
