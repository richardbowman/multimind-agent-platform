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
  CircularProgress,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Toolbar,
  Chip
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import { useIPCService, useWebSocket } from '../contexts/DataContext';
import { Settings } from '../../../../tools/settings';
import { ModelInfo } from '../../../../llm/types';
import { getClientSettingsMetadata } from '../../../../tools/settingsDecorators';
import { DrawerPage } from './GlobalArtifactViewer';

export const SettingsPanel: React.FC<DrawerPage> = ({ drawerOpen, onDrawerToggle }) => {
    const [settings, setSettings] = useState<Settings>({});
    const [validationMessage, setValidationMessage] = useState<string>('');
    const [successMessage, setSuccessMessage] = useState<string>('');
    const { getSettings, updateSettings } = useWebSocket();
    const ipcService = useIPCService();
    const metadata = getClientSettingsMetadata(new Settings());

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

    const [availableModels, setAvailableModels] = useState<Record<string, ModelInfo[]>>({});
    const [availableEmbedders, setAvailableEmbedders] = useState<Record<string, EmbedderModelInfo[]>>({});
    
    useEffect(() => {
        const fetchModels = async () => {
            if (settings.providers?.chat) {
                try {
                    const [models, embedders] = await Promise.all([
                        ipcService.getRPC().getAvailableModels(settings.providers.chat),
                        ipcService.getRPC().getAvailableEmbedders(settings.providers.embeddings)
                    ]);

                    // Sort models with local first, then by name
                    const sortedModels = models.sort((a, b) => {
                        if (a.isLocal === b.isLocal) {
                            return a.name.localeCompare(b.name);
                        }
                        return a.isLocal ? -1 : 1;
                    });

                    // Sort embedders by downloads
                    const sortedEmbedders = embedders.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
                
                    setAvailableModels(prev => ({
                        ...prev,
                        [settings.providers!.chat]: sortedModels
                    }));

                    setAvailableEmbedders(prev => ({
                        ...prev,
                        [settings.providers!.chat]: sortedEmbedders
                    }));
                } catch (error) {
                    console.error('Failed to fetch models:', error);
                }
            }
        };
        
        fetchModels();
    }, [settings.providers?.chat]);

    const handleChange = async (key: string, value: string | number) => {
        // Get metadata using reflection
        const fieldMeta = metadata[key];
        const processedValue = fieldMeta?.type === 'number' ? Number(value) : value;
        
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

        // If this is a provider change, fetch new models
        if (key === 'providers.chat') {
            try {
                const models = await ipcService.getRPC().getAvailableModels(value as string);
                setAvailableModels(prev => ({
                    ...prev,
                    [value as string]: models
                }));
            } catch (error) {
                console.error('Failed to fetch available models:', error);
            }
        }
    };

    const [saveSuccess, setSaveSuccess] = useState(false);

    const handleSave = async () => {
        // Get all required fields from metadata
        const missingFields = Object.entries(metadata)
            .filter(([_, meta]) => meta.required)
            .filter(([key, _]) => {
                const value = getNestedValue(settings, key);
                return !value && value !== 0 && value !== false;
            })
            .map(([_, meta]) => meta.label);

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

    const renderInput = (metadata: {
        key: string;
        label: string;
        type: string;
        category: string;
        description?: string;
        options?: string[];
        defaultValue?: any;
        sensitive?: boolean;
        required?: boolean;
    }) => {
        // Skip rendering for section type fields
        if (metadata.type === 'section') {
            return null;
        }

        const value = getNestedValue(settings, metadata.key) ?? metadata.defaultValue ?? '';

        switch (metadata.type) {
            case 'select':
                // Special handling for model selection
                if (metadata.key.startsWith('models.')) {
                    const provider = settings.providers?.chat;
                    const models = provider ? 
                        (metadata.key.includes('embedding') ? 
                            availableEmbedders[provider] || [] :
                            availableModels[provider] || []) : 
                        [];
                    
                    return (
                        <FormControl fullWidth variant="outlined">
                            <InputLabel>{metadata.label}</InputLabel>
                            <Select
                                value={value}
                                onChange={(e) => handleChange(metadata.key, e.target.value)}
                                label={metadata.label}
                                MenuProps={{
                                    PaperProps: {
                                        style: {
                                            maxHeight: 400,
                                            width: 600
                                        }
                                    }
                                }}
                            >
                                {models.map(model => (
                                    <MenuItem 
                                        key={model.name||model.id} 
                                        value={model.id}
                                        sx={{
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'flex-start',
                                            gap: 0.5,
                                            py: 1.5
                                        }}
                                    >
                                        <Box sx={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-between',
                                            width: '100%'
                                        }}>
                                            <Typography variant="body1" fontWeight={500}>
                                                {model.name||model.id}
                                            </Typography>
                                            <Chip 
                                                label={model.id.includes('/') ? 'Remote' : 'Local'} 
                                                size="small"
                                                color={model.id.includes('/') ? 'secondary' : 'primary'}
                                                sx={{ ml: 1 }}
                                            />
                                        </Box>
                                        {'pipelineTag' in model && (
                                            <Typography variant="caption" color="text.secondary">
                                                Pipeline: {model.pipelineTag}
                                            </Typography>
                                        )}
                                        {'supportedTasks' in model && model.supportedTasks.length > 0 && (
                                            <Typography variant="caption" color="text.secondary">
                                                Tasks: {model.supportedTasks.join(', ')}
                                            </Typography>
                                        )}
                                        <Box sx={{ 
                                            display: 'flex', 
                                            gap: 1,
                                            fontSize: '0.875rem',
                                            color: 'text.secondary'
                                        }}>
                                            {model.size && (
                                                <Typography variant="caption">
                                                    Size: {model.size}
                                                </Typography>
                                            )}
                                            {model.author && (
                                                <Typography variant="caption">
                                                    By {model.author}
                                                </Typography>
                                            )}
                                            {model.downloads && (
                                                <Typography variant="caption">
                                                    {model.downloads.toLocaleString()} downloads
                                                </Typography>
                                            )}
                                        </Box>
                                        {model.description && (
                                            <Typography variant="caption" color="text.secondary">
                                                {model.description}
                                            </Typography>
                                        )}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    );
                }
                
                // Regular select
                return (
                    <FormControl fullWidth variant="outlined">
                        <InputLabel>{metadata.label}</InputLabel>
                        <Select
                            value={value}
                            onChange={(e) => handleChange(metadata.key, e.target.value)}
                            label={metadata.label}
                        >
                            {metadata.options?.map(option => (
                                <MenuItem key={option} value={option}>
                                    {option}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
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
    
    // Convert to array and group by category
    const categories = Object.entries(metadata).reduce((acc, [key, meta]) => {
        if (!acc[meta.category]) {
            acc[meta.category] = [];
        }
        acc[meta.category].push({
            key,
            ...meta
        });
        return acc;
    }, {} as Record<string, Array<{
        key: string;
        label: string;
        type: string;
        category: string;
        description?: string;
        options?: string[];
        defaultValue?: any;
        sensitive?: boolean;
        required?: boolean;
    }>>);

    return (
        <Box sx={{ 
            display: 'flex',
            flex: 1,
            overflow: 'hidden'
        }}>
            <Drawer
                variant="persistent"
                anchor="left"
                open={drawerOpen}
                sx={{
                    width: 250,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: 250,
                        boxSizing: 'border-box',
                        backgroundColor: '#2a2a2a',
                        borderRight: '1px solid #444'
                    },
                }}
            >
                <Toolbar />
                <List>
                    {Object.keys(categories).map((category) => (
                        <ListItem key={category} disablePadding>
                            <ListItemButton
                                onClick={() => {
                                    const element = document.getElementById(category);
                                    if (element) {
                                        element.scrollIntoView({ behavior: 'smooth' });
                                    }
                                }}
                            >
                                <ListItemText primary={category} />
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            </Drawer>

            <Box component="main" sx={{ 
                flexGrow: 1, 
                p: 3,
                marginLeft: drawerOpen ? 0: '-250px',
                transition: 'margin 225ms cubic-bezier(0, 0, 0.2, 1) 0ms',
                flex: 1,
                overflowY: 'auto'
            }}>
                <Typography variant="h4" sx={{ mb: 3 }}>
                    Settings
                </Typography>
            
            <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                flex: 1, 
                gap: 3,
                overflowY: 'auto'
            }}
            >
                {Object.entries(categories).map(([category, metadataList]) => {
                    // Filter model settings based on selected provider
                    const filteredList = category === 'LLM Settings' 
                        ? metadataList.filter(meta => {
                            // Skip if not a model setting
                            if (!meta.key.startsWith('models.')) return true;
                            
                            // Get the provider type from the key (e.g. models.conversation.lmstudio)
                            const providerType = meta.key.split('.')[2];
                            
                            // Show only settings for the selected provider
                            return providerType === settings.providers?.chat;
                        })
                        : metadataList;

                    return (
                        <Paper 
                            key={category}
                            id={category}
                            sx={{ 
                                p: 3, 
                                bgcolor: 'background.paper',
                                borderRadius: 2,
                                boxShadow: 1,
                                mb: 3
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
                                {filteredList.map(metadata => (
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
                    );
                })}
                
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
        </Box>
    );
};
