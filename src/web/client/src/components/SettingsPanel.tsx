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
  Toolbar
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
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

    // Group settings by category
    const categories = CONFIG_METADATA.reduce((acc, metadata) => {
        if (!acc[metadata.category]) {
            acc[metadata.category] = [];
        }
        acc[metadata.category].push(metadata);
        return acc;
    }, {} as Record<string, ConfigMetadata[]>);

    const [drawerOpen, setDrawerOpen] = useState(true);

    return (
        <Box sx={{ 
            display: 'flex',
            height: '100vh',
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
                marginLeft: drawerOpen ? '250px' : 0,
                transition: 'margin 225ms cubic-bezier(0, 0, 0.2, 1) 0ms',
                height: '100vh',
                overflowY: 'auto'
            }}>
                <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 2,
                    mb: 3
                }}>
                    <IconButton
                        color="inherit"
                        edge="start"
                        onClick={() => setDrawerOpen(!drawerOpen)}
                        sx={{ mr: 2 }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Typography variant="h4">
                        Settings
                    </Typography>
                </Box>
            
            <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: 3,
                overflowY: 'auto',
                height: 'calc(100vh - 64px)' // Subtract header height
            }}>
                {Object.entries(categories).map(([category, metadataList]) => (
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
