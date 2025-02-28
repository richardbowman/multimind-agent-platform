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
    Chip,
    Autocomplete,
    Slider,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions,
    FormControlLabel,
    Checkbox
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import { IconButton } from '@mui/material';
import { useDataContext } from '../contexts/DataContext';
import { useIPCService } from '../contexts/IPCContext';
import { Settings } from '../../../../tools/settings';
import { ModelInfo } from '../../../../llm/types';
import ModelSelector from './ModelSelector';
import { getClientSettingsMetadata } from '../../../../tools/settingsDecorators';
import { DrawerPage } from './GlobalArtifactViewer';

// Import package.json and LICENSE file contents
import packageJson from '../../../../../package.json';
import licenseText from '../../../../../docs/LICENSE.md';
import { ActionToolbar } from './shared/ActionToolbar';
import { AgentBuilder } from './AgentBuilder';
import { EmbedderModelInfo } from '../../../../llm/ILLMService';
import { asError, isError } from '../../../../types/types';
import { ScrollView } from './shared/ScrollView';

export const SettingsPanel: React.FC<DrawerPage> = ({ drawerOpen, onDrawerToggle }) => {
    const [settings, setSettings] = useState<Settings>({});
    const [validationMessage, setValidationMessage] = useState<string>('');
    const [successMessage, setSuccessMessage] = useState<string>('');
    const { getSettings, updateSettings } = useDataContext();
    const ipcService = useIPCService();
    const metadata = getClientSettingsMetadata(new Settings());
    const [availableModels, setAvailableModels] = useState<Record<string, ModelInfo[]>>({});
    const [availableEmbedders, setAvailableEmbedders] = useState<Record<string, EmbedderModelInfo[]>>({});

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



    const handleChange = async (key: string, value: string | number | boolean) => {
        console.log('handleChange:', key, value);
        // Get metadata using reflection
        const fieldMeta = metadata[key];
        const processedValue = 
            fieldMeta?.type === 'boolean' ? Boolean(value) : 
            fieldMeta?.type === 'number' ? Number(value) : value;

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
    const [aboutOpen, setAboutOpen] = useState(false);
    const [rebuildDialogOpen, setRebuildDialogOpen] = useState(false);
    const [resetDialogOpen, setResetDialogOpen] = useState(false);
    const [modelDialog, setModelDialog] = useState<{
        open: boolean;
        key: string;
        provider: string;
    }>({
        open: false,
        key: '',
        provider: ''
    });

    const handleSave = async () => {
        console.log('Saving settings:', settings);
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
            const updatedSettings = await updateSettings(settings);
            if (updatedSettings.message) throw new Error(updatedSettings.message);
            console.log('Updated settings:', updatedSettings);
            setSettings(updatedSettings);

            setSuccessMessage('Settings saved successfully');
            setValidationMessage('');
            setSaveSuccess(true);

            // Reload available models after successful save
            try {
                if (settings.providers?.chat) {
                    const models = await ipcService.getRPC().getAvailableModels(settings.providers.chat);
                    setAvailableModels(prev => ({
                        ...prev,
                        [settings.providers!.chat]: models
                    }));
                }
                if (settings.providers?.embeddings) {
                    const embedders = await ipcService.getRPC().getAvailableEmbedders(settings.providers.embeddings);
                    setAvailableEmbedders(prev => ({
                        ...prev,
                        [settings.providers!.embeddings]: embedders
                    }));
                }
            } catch (error) {
                console.error('Failed to reload models:', error);
            }

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
                // Handle custom components
                if (metadata.key.startsWith('models.')) {
                    const provider = metadata.key.includes('embedding') ?
                        settings.providers?.embeddings :
                        settings.providers?.chat;
                    
                    return (
                        <Box sx={{ width: '100%' }}>
                            <TextField
                                value={value}
                                label={metadata.label}
                                variant="outlined"
                                fullWidth
                                InputProps={{
                                    readOnly: true,
                                    endAdornment: (
                                        <IconButton 
                                            onClick={() => setModelDialog({ open: true, key: metadata.key, provider: provider || '' })}
                                            edge="end"
                                        >
                                            <SearchIcon />
                                        </IconButton>
                                    )
                                }}
                            />
                        </Box>
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
            case 'slider':
                return (
                    <Box sx={{ width: '100%' }}>
                        <Typography gutterBottom>
                            {metadata.label}: {value}
                        </Typography>
                        <Slider
                            value={value}
                            onChange={(_, newValue) => handleChange(metadata.key, newValue)}
                            min={metadata.min || 0}
                            max={metadata.max || 100}
                            step={metadata.step || 1}
                            valueLabelDisplay="auto"
                            sx={{ width: '95%', ml: '2.5%' }}
                        />
                        {metadata.description && (
                            <Typography variant="caption" color="text.secondary">
                                {metadata.description}
                            </Typography>
                        )}
                    </Box>
                );
            case 'boolean':
                return (
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={!!value}
                                onChange={(e) => handleChange(metadata.key, e.target.checked)}
                            />
                        }
                        label={metadata.label}
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

    // Define the explicit category order with API Keys first
    const categoryOrder = [
        'API Keys',
        'LLM Settings', 
        'Embeddings',
        'Search Settings',
        'Vector DB',
        'Rate Limiting',
        'Server Settings',
        'UI Settings',
        'Agent Builder'
    ];

    // Sort categories according to our defined order
    const sortedCategories = Object.entries(categories).sort(([a], [b]) => {
        const aIndex = categoryOrder.indexOf(a);
        const bIndex = categoryOrder.indexOf(b);
        // If category is not in order list, put it at the end
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        // Sort by the defined order
        return aIndex - bIndex;
    });

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
                        boxSizing: 'border-box'
                    },
                }}
            >
                <Toolbar />
                <List>
                    {sortedCategories.map(([category]) => (
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
                marginLeft: drawerOpen ? 0 : '-250px',
                transition: 'margin 225ms cubic-bezier(0, 0, 0.2, 1) 0ms',
                display: 'flex',
                flexDirection: 'column',
                height: '100%'
            }}>
                <Box sx={{
                    bottom: 0,
                    left: drawerOpen ? 250 : 0,
                    right: 0,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    p: 2,
                    zIndex: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 2,
                    transition: 'left 225ms cubic-bezier(0, 0, 0.2, 1) 0ms'
                }}>
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
                <Box sx={{
                    flex: 1,
                    overflowY: 'auto',
                    p: 3
                }}>
                    <ScrollView sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                        gap: 3
                    }}
                    >
                        {sortedCategories.map(([category, metadataList]) => {
                            // Special handling for Agent Builder
                            if (category === 'Agent Builder') {
                                return (
                                    <AgentBuilder
                                        key={category}
                                        settings={settings}
                                        onSettingsChange={setSettings}
                                    />
                                );
                            }
                            // Filter model settings based on selected provider
                            const filteredList = category === 'LLM Settings' || category === 'Embeddings'
                                ? metadataList.filter(meta => {
                                    // Skip if not a model setting
                                    if (!meta.key.startsWith('models.')) return true;

                                    // Get the provider type from the key (e.g. models.conversation.lmstudio)
                                    const providerType = meta.key.split('.')[2];

                                    // For embedding models, check against embeddings provider
                                    if (meta.key.includes('embedding')) {
                                        return settings?.providers?.embeddings && providerType === settings.providers.embeddings;
                                    }

                                    // For chat models, check against chat provider
                                    return settings?.providers?.chat && providerType === settings.providers.chat;
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

                    </ScrollView> {/* End of scrollable content */}
                </Box>
                <ActionToolbar
                    align="space-between"
                    actions={[
                        {
                            label: 'About',
                            variant: 'outlined',
                            onClick: () => setAboutOpen(true)
                        },
                        {
                            label: 'Rebuild VectorDB',
                            variant: 'outlined',
                            color: 'warning',
                            onClick: () => setRebuildDialogOpen(true)
                        },
                        {
                            label: 'Reset to Factory Settings',
                            variant: 'outlined',
                            color: 'error',
                            onClick: () => setResetDialogOpen(true)
                        },
                        {
                            label: saveSuccess ? 'Saved!' : 'Save Settings',
                            variant: 'contained',
                            onClick: handleSave,
                            disabled: saveSuccess,
                            color: saveSuccess ? 'success' : 'primary'
                        }
                    ]}
                />
            </Box>

            {/* About Dialog */}
            <Dialog
                open={aboutOpen}
                onClose={() => setAboutOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>About MultiMind Agent Platform</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        <Typography variant="body1" gutterBottom>
                            Version: {packageJson.version}
                        </Typography>
                        <Typography variant="body1" gutterBottom>
                            Copyright © 2025 Rick Bowman
                        </Typography>
                        <Typography variant="body2" component="pre" sx={{
                            whiteSpace: 'pre-wrap',
                            wordWrap: 'break-word',
                            mt: 2,
                            p: 2,
                            backgroundColor: 'background.paper',
                            borderRadius: 1
                        }}>
                            {licenseText}
                        </Typography>
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAboutOpen(false)} color="primary">
                        Close
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Rebuild VectorDB Dialog */}
            <Dialog
                open={rebuildDialogOpen}
                onClose={() => setRebuildDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Rebuild VectorDB</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to rebuild the VectorDB? This operation may take some time.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRebuildDialogOpen(false)} color="primary">
                        Cancel
                    </Button>
                    <Button 
                        onClick={async () => {
                            setRebuildDialogOpen(false);
                            try {
                                await ipcService.getRPC().rebuildVectorDB();
                                setSuccessMessage('VectorDB rebuild started successfully');
                            } catch (error) {
                                setValidationMessage(`Failed to rebuild VectorDB: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            }
                        }}
                        color="warning"
                    >
                        Rebuild
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Reset Settings Dialog */}
            <Dialog
                open={resetDialogOpen}
                onClose={() => setResetDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Reset to Factory Settings</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to reset all settings to factory defaults? This cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setResetDialogOpen(false)} color="primary">
                        Cancel
                    </Button>
                    <Button 
                        onClick={async () => {
                            setResetDialogOpen(false);
                            try {
                                const defaultSettings = new Settings();
                                const { settings: updatedSettings } = await updateSettings(defaultSettings);
                                setSettings(updatedSettings);
                                setSuccessMessage('Settings reset to factory defaults');
                            } catch (error) {
                                setValidationMessage(`Failed to reset settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
                            }
                        }}
                        color="error"
                    >
                        Reset Settings
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Model Selector Dialog */}
            <Dialog
                open={modelDialog.open}
                onClose={() => setModelDialog(prev => ({ ...prev, open: false }))}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>Select Model</DialogTitle>
                <DialogContent>
                    <ModelSelector
                        value={getNestedValue(settings, modelDialog.key)}
                        onChange={(newValue) => {
                            handleChange(modelDialog.key, newValue);
                            setModelDialog(prev => ({ ...prev, open: false }));
                        }}
                        provider={modelDialog.provider}
                    />
                </DialogContent>
            </Dialog>
        </Box>
    );
};
