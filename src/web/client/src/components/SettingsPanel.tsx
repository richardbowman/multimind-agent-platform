import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  TextField, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  Button, 
  Alert,
  CircularProgress
} from '@mui/material';
import { useWebSocket } from '../contexts/DataContext';
import { Settings, CONFIG_METADATA, ConfigMetadata } from '../types/settings';

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
        
        // Handle nested keys (e.g. "providers.chat")
        const parts = key.split('.');
        setSettings(prev => {
            const newSettings = { ...prev };
            let current = newSettings;
            
            // Navigate to the correct nesting level
            for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) {
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
        if (provider === 'anthropic' && !settings.anthropic?.api?.key) {
            missingFields.push('Anthropic API Key');
        }
        if (provider === 'openai' && !settings.openai?.api?.key) {
            missingFields.push('OpenAI API Key');
        }
        if (provider === 'openrouter' && !settings.openrouter?.api?.key) {
            missingFields.push('OpenRouter API Key');
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
        const value = getNestedValue(settings, metadata.key) ?? metadata.defaultValue ?? '';

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
                    <TextField
                        type="number"
                        value={value}
                        onChange={(e) => handleChange(metadata.key, e.target.value)}
                        label={metadata.label}
                        variant="outlined"
                        fullWidth
                    />
                );
            default:
                return (
                    <TextField
                        type={metadata.sensitive ? 'password' : 'text'}
                        value={getNestedValue(settings, metadata.key) ?? value}
                        onChange={(e) => handleChange(metadata.key, e.target.value)}
                        label={metadata.label}
                        variant="outlined"
                        fullWidth
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
        <Box sx={{ 
            maxWidth: 800, 
            mx: 'auto', 
            p: 3 
        }}>
            <Typography variant="h4" gutterBottom>
                Settings
            </Typography>
            
            <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 3 
            }}>
                {Object.entries(categories).map(([category, metadataList]) => (
                    <Paper 
                        key={category}
                        sx={{ 
                            p: 3, 
                            bgcolor: 'background.paper',
                            borderRadius: 2,
                            boxShadow: 1
                        }}
                    >
                        <Typography variant="h6" gutterBottom sx={{ 
                            mb: 2, 
                            pb: 1, 
                            borderBottom: '1px solid',
                            borderColor: 'divider'
                        }}>
                            {category}
                        </Typography>
                        
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {metadataList.map(metadata => (
                                <FormControl key={metadata.key} fullWidth>
                                    {renderInput(metadata)}
                                    {metadata.description && (
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                            {metadata.description}
                                        </Typography>
                                    )}
                                </FormControl>
                            ))}
                        </Box>
                    </Paper>
                ))}
                
                <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    mt: 2 
                }}>
                    <Button
                        variant="contained"
                        onClick={handleSave}
                        disabled={saveSuccess}
                        sx={{
                            minWidth: 120,
                            transition: 'all 0.3s',
                            ...(saveSuccess && {
                                bgcolor: 'success.main',
                                '&:hover': {
                                    bgcolor: 'success.dark'
                                }
                            })
                        }}
                    >
                        {saveSuccess ? (
                            <>
                                Saved!
                            </>
                        ) : (
                            'Save Settings'
                        )}
                    </Button>
                </Box>
                
                {validationMessage && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                        {validationMessage}
                    </Alert>
                )}
                
                {successMessage && (
                    <Alert severity="success" sx={{ mt: 2 }}>
                        {successMessage}
                    </Alert>
                )}
            </Box>
        </Box>
    );
};
