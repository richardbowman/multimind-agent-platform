import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { Settings, CONFIG_METADATA, ConfigMetadata } from '../types/settings';
import './SettingsPanel.css';

export const SettingsPanel: React.FC = () => {
    const [settings, setSettings] = useState<Settings>({});
    const [validationMessage, setValidationMessage] = useState<string>('');
    const [successMessage, setSuccessMessage] = useState<string>('');
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
        
        // Handle nested keys (e.g. "bedrock.maxTokensPerMinute")
        const parts = key.split('.');
        setSettings(prev => {
            const newSettings = { ...prev };
            let current = newSettings;
            
            // Navigate to the correct nesting level
            for (let i = 0; i < parts.length - 1; i++) {
                if (!(parts[i] in current)) {
                    current[parts[i]] = {};
                }
                current = current[parts[i]];
            }
            
            // Set the value at the final nesting level
            current[parts[parts.length - 1]] = processedValue;
            return newSettings;
        });
    };

    const [saveSuccess, setSaveSuccess] = useState(false);

    const handleSave = async () => {
        // Get all required fields from metadata
        const missingFields = CONFIG_METADATA
            .filter(metadata => metadata.required)
            .filter(metadata => {
                const value = getNestedValue(settings, metadata.key);
                return !value && value !== 0 && value !== false;
            })
            .map(metadata => metadata.label);

        // Add provider-specific required fields
        const provider = settings.providers?.chat;
        if (provider === 'anthropic' && (!settings.anthropic?.api?.key)) {
            missingFields.push('Anthropic API Key');
        }

        if (missingFields.length > 0) {
            setValidationMessage(`Please fill in the following required fields: ${missingFields.join(', ')}`);
            setSuccessMessage('');
            setSaveSuccess(false);
            return;
        }

        try {
            console.log('Saving settings:', settings);
            await updateSettings(settings);
            const updatedSettings = await getSettings();
            console.log('Updated settings:', updatedSettings);
            setSettings(updatedSettings);
            setSuccessMessage('Settings saved successfully');
            setValidationMessage('');
            setSaveSuccess(true);
            
            // Reset success state after animation
            setTimeout(() => {
                setSaveSuccess(false);
            }, 2000);
        } catch (error) {
            console.error('Failed to save settings:', error);
            setValidationMessage(`Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setSuccessMessage('');
            setSaveSuccess(false);
        }
    };

    const getNestedValue = (obj: any, path: string): any => {
        return path.split('.').reduce((current, part) => current?.[part], obj);
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
                        value={getNestedValue(settings, metadata.key) ?? value}
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
                <button 
                    className={`save-button ${saveSuccess ? 'success' : ''}`} 
                    onClick={handleSave}
                >
                    Save Settings
                </button>
                {validationMessage && (
                    <div className="validation-message">
                        {validationMessage}
                    </div>
                )}
                {successMessage && (
                    <div className="success-message">
                        {successMessage}
                    </div>
                )}
            </div>
        </div>
    );
};
