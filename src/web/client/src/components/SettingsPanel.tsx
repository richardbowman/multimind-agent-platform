import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { Settings, CONFIG_METADATA, ConfigMetadata } from '../types/settings';
import './SettingsPanel.css';

export const SettingsPanel: React.FC = () => {
    const [settings, setSettings] = useState<Settings>({});
    const { getSettings, updateSettings } = useWebSocket();

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const currentSettings = await getSettings();
                if (currentSettings) {
                    setSettings(currentSettings);
                }
            } catch (error) {
                console.error('Failed to load settings:', error);
            }
        };
        loadSettings();
    }, [getSettings]);

    const handleChange = (key: string, value: string | number) => {
        const metadata = CONFIG_METADATA.find(m => m.key === key);
        const processedValue = metadata?.type === 'number' ? Number(value) : value;
        setSettings(prev => ({ ...prev, [key]: processedValue }));
    };

    const handleSave = async () => {
        // Validate required fields based on provider
        const provider = settings.llmProvider;
        let missingFields: string[] = [];

        // Common required fields
        if (!settings.host) missingFields.push('Host');
        if (!settings.port) missingFields.push('Port');
        if (!settings.protocol) missingFields.push('Protocol');
        if (!settings.vectorDatabaseType) missingFields.push('Vector Database Type');

        // Provider-specific validation
        if (provider === 'lmstudio' && !settings.lmstudioApiKey) {
            missingFields.push('LM Studio API Key');
        } else if (provider === 'anthropic' && !settings.anthropicApiKey) {
            missingFields.push('Anthropic API Key');
        }

        if (missingFields.length > 0) {
            // alert(`Please fill in the following required fields:\n${missingFields.join('\n')}`);
            return;
        }

        try {
            const updatedSettings = await updateSettings(settings);
            setSettings(updatedSettings); // Update local state with confirmed settings
            // alert('Settings saved successfully');
        } catch (error) {
            console.error('Failed to save settings:', error);
            // alert(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    };

    const renderInput = (metadata: ConfigMetadata) => {
        const value = settings[metadata.key] ?? metadata.defaultValue ?? '';

        switch (metadata.type) {
            case 'select':
                return (
                    <select
                        value={value}
                        onChange={(e) => handleChange(metadata.key, e.target.value)}
                    >
                        {metadata.options?.map(option => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                );
            case 'number':
                return (
                    <input
                        type="number"
                        value={value}
                        onChange={(e) => handleChange(metadata.key, e.target.value)}
                        placeholder={`Enter ${metadata.label.toLowerCase()}`}
                    />
                );
            default:
                return (
                    <input
                        type={metadata.sensitive ? 'password' : 'text'}
                        value={value}
                        onChange={(e) => handleChange(metadata.key, e.target.value)}
                        placeholder={`Enter ${metadata.label.toLowerCase()}`}
                    />
                );
        }
    };

    // Group settings by category
    const categories = CONFIG_METADATA.reduce((acc, metadata) => {
        if (!acc[metadata.category]) {
            acc[metadata.category] = [];
        }
        acc[metadata.category].push(metadata);
        return acc;
    }, {} as Record<string, ConfigMetadata[]>);

    return (
        <div className="settings-panel">
            <h2>Settings</h2>
            <div className="settings-form">
                {Object.entries(categories).map(([category, metadataList]) => (
                    <section key={category} className="settings-section">
                        <h3>{category}</h3>
                        {metadataList.map(metadata => (
                            <div key={metadata.key} className="form-group">
                                <label>{metadata.label}:</label>
                                {renderInput(metadata)}
                                {metadata.description && (
                                    <small className="description">{metadata.description}</small>
                                )}
                            </div>
                        ))}
                    </section>
                ))}
                <button className="save-button" onClick={handleSave}>
                    Save Settings
                </button>
            </div>
        </div>
    );
};
