import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

interface Settings {
    provider: string;
    model: string;
    apiKey: string;
}

export const SettingsPanel: React.FC = () => {
    const [settings, setSettings] = useState<Settings>({
        provider: 'openai',
        model: 'gpt-4',
        apiKey: ''
    });

    const { socket } = useWebSocket();

    useEffect(() => {
        // Load initial settings
        if (socket) {
            socket.emit('getSettings', (settings: Settings) => {
                setSettings(settings);
            });
        }
    }, [socket]);

    const handleSave = () => {
        if (socket) {
            socket.emit('updateSettings', settings);
        }
    };

    return (
        <div className="settings-panel">
            <h2>Settings</h2>
            <div className="settings-form">
                <div className="form-group">
                    <label>Provider:</label>
                    <select 
                        value={settings.provider}
                        onChange={(e) => setSettings({...settings, provider: e.target.value})}
                    >
                        <option value="openai">OpenAI</option>
                        <option value="anthropic">Anthropic</option>
                        <option value="azure">Azure OpenAI</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>Model:</label>
                    <select
                        value={settings.model}
                        onChange={(e) => setSettings({...settings, model: e.target.value})}
                    >
                        <option value="gpt-4">GPT-4</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                        <option value="claude-2">Claude 2</option>
                    </select>
                </div>

                <div className="form-group">
                    <label>API Key:</label>
                    <input
                        type="password"
                        value={settings.apiKey}
                        onChange={(e) => setSettings({...settings, apiKey: e.target.value})}
                        placeholder="Enter your API key"
                    />
                </div>

                <button className="save-button" onClick={handleSave}>
                    Save Settings
                </button>
            </div>
        </div>
    );
};
