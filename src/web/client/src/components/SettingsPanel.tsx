import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button,
    Alert, Drawer,
    List,
    ListItem,
    ListItemButton,
    ListItemText, Toolbar, Dialog,
    DialogTitle,
    DialogContent,
    DialogContentText,
    DialogActions
} from '@mui/material';
import { useDataContext } from '../contexts/DataContext';
import { useIPCService } from '../contexts/IPCContext';
import { Settings } from '../../../../tools/settings';
import { getClientSettingsMetadata } from '../../../../tools/settingsDecorators';
import { DrawerPage } from './GlobalArtifactViewer';

// Import package.json and LICENSE file contents
import packageJson from '../../../../../package.json';
import licenseText from '../../../../../docs/LICENSE.md';
import { ActionToolbar } from './shared/ActionToolbar';
import { ScrollView } from './shared/ScrollView';
import { SettingsFormBuilder } from './SettingsFormBuilder';

export const SettingsPanel: React.FC<DrawerPage> = ({ drawerOpen, onDrawerToggle }) => {
    const [settings, setSettings] = useState<Settings>({});
    const [validationMessage, setValidationMessage] = useState<string>('');
    const [successMessage, setSuccessMessage] = useState<string>('');
    const { getSettings, updateSettings, configError } = useDataContext();
    const ipcService = useIPCService();
    const metadata = getClientSettingsMetadata(new Settings());
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

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const currentSettings = await getSettings();
                if (currentSettings) {
                    setSettings(currentSettings);
                }
                // If there was a config error, show it
                if (configError) {
                    setValidationMessage(configError);
                }
            } catch (error) {
                console.error('Failed to load settings:', error);
                setValidationMessage(`Failed to load settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        };
        loadSettings();
    }, [getSettings, configError]);



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
    };

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
        'Providers',
        'Models',
        'Embeddings',
        'Search Settings',
        'Text-to-Speech',
        'Indexing',
        'UI Settings',
    ];

    // Sort categories according to our defined order
    const sortedCategories = Object.entries(categories).sort(([a], [b]) => {
        const aIndex = categoryOrder.indexOf(a);
        const bIndex = categoryOrder.indexOf(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
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
                overflow: 'hidden',
                flexDirection: 'column',
                height: '100%'
            }}>
                {(validationMessage || successMessage) && (
                <Box sx={{
                    bottom: 0,
                    left: drawerOpen ? 250 : 0,
                    right: 0,
                    p: 2,
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
                </Box>)}
                <Box sx={{
                    display: 'flex',
                    flex: 1,
                    flexDirection: 'column',
                    overflow: 'hidden'
                }}>
                    <ScrollView sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1
                    }}
                    innerSx={{
                        display: 'flex',
                        flexDirection: 'column',
                        p: 1,
                        flex: 1
                    }}
                    >
                        <SettingsFormBuilder
                            categories={sortedCategories}
                            settings={settings}
                            metadata={metadata}
                            onSettingChange={handleChange}
                            onModelSelect={(key, provider) => {
                                console.log('Opening model selector for:', key, provider);
                                setModelDialog({ open: true, key, provider });
                            }}
                        />
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
                                const updatedSettings = await ipcService.getRPC().resetSettings();
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
        </Box>
    );
};
