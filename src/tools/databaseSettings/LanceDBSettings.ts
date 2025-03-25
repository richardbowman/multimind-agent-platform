import { ClientSettings } from '../settingsDecorators';

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
}
