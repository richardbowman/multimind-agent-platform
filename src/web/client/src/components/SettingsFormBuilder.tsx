import React from 'react';
import {
    Box, Typography,
    TextField,
    Select,
    MenuItem,
    FormControl,
    InputLabel,
    IconButton,
    FormControlLabel,
    Checkbox,
    Slider
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { ModelConfigBuilder } from './ModelConfigBuilder';

interface SettingsFormBuilderProps {
    settings: any;
    metadata: any;
    categories: any;
    onSettingChange: (key: string, value: string | number | boolean) => void;
    onModelSelect: (key: string, provider: string) => void;
}

export const SettingsFormBuilder: React.FC<SettingsFormBuilderProps> = ({
    settings,
    categories,
    metadata,
    onSettingChange,
    onModelSelect
}) => {
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
        if (metadata.type === 'section') {
            return null;
        }

        const value = getNestedValue(settings, metadata.key) ?? metadata.defaultValue ?? '';

        switch (metadata.type) {
            case 'select':
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
                                            onClick={() => onModelSelect(metadata.key, provider || '')}
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

                return (
                    <FormControl fullWidth variant="outlined">
                        <InputLabel>{metadata.label}</InputLabel>
                        <Select
                            value={value}
                            onChange={(e) => onSettingChange(metadata.key, e.target.value)}
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
                        onChange={(e) => onSettingChange(metadata.key, e.target.value)}
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
                            onChange={(_, newValue) => onSettingChange(metadata.key, newValue)}
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
                                onChange={(e) => onSettingChange(metadata.key, e.target.checked)}
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
                        onChange={(e) => onSettingChange(metadata.key, e.target.value)}
                        label={metadata.label}
                        variant="outlined"
                        fullWidth
                    />
                );
        }
    };

    return (
        <Box sx={{
            flex: 1,
            overflowY: 'auto',
            p: 3
        }}>
            {categories.map(([category, metadataList]) => {
                // Special handling for Model Configurations
                if (category === 'Model Configurations') {
                    return (
                        <Box key={category} id={category}>
                            <Typography variant="h6" gutterBottom>
                                {category}
                            </Typography>
                            <ModelConfigBuilder
                                settings={settings}
                                onSettingsChange={(newSettings) => {
                                    // Update settings in parent component
                                    onSettingChange('modelConfigs', newSettings.modelConfigs);
                                }}
                            />
                        </Box>
                    );
                }

                // Filter model settings based on selected provider
                const filteredList = category === 'LLM Settings' || category === 'Embeddings'
                    ? metadataList.filter(meta => {
                        if (!meta.key.startsWith('models.')) return true;
                        const providerType = meta.key.split('.')[2];
                        if (meta.key.includes('embedding')) {
                            return settings?.providers?.embeddings && providerType === settings.providers.embeddings;
                        }
                        return settings?.providers?.chat && providerType === settings.providers.chat;
                    })
                    : metadataList;

                return (
                    <Box
                        key={category}
                        id={category}
                    >
                        <Typography variant="h6" gutterBottom>
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
                    </Box>
                );
            })}
        </Box>
    );
};
