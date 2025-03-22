import React, { ErrorInfo } from 'react';
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
import { SettingsListBuilder } from './SettingsListBuilder';
import { PROVIDER_CONFIG_DEFAULTS, ProviderConfig } from '../../../../tools/providerConfig';
import { MODEL_CONFIG_DEFAULTS, ModelProviderConfig } from '../../../../tools/modelProviderConfig';

interface SettingsFormBuilderProps {
    settings: any;
    metadata: any;
    categories: any;
    onSettingChange: (key: string, value: string | number | boolean) => void;
    onModelSelect: (key: string, provider: string) => void;
}

interface ErrorBoundaryProps {
    fallback: React.ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    children: React.ReactNode;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps> {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        this.props.onError?.(error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback;
        }
        return this.props.children;
    }
}

const ModelConfigErrorFallback = () => (
    <Box sx={{ p: 2, border: '1px solid', borderColor: 'error.main', borderRadius: 1 }}>
        <Typography color="error">
            Error loading model configurations. Try resetting to factory defaults.
        </Typography>
    </Box>
);

export const SettingsFormBuilder: React.FC<SettingsFormBuilderProps> = ({
    settings,
    categories,
    metadata,
    onSettingChange,
    onModelSelect
}) => {
    const getNestedValue = (obj: any, path: string): any => {
        console.debug(`getting nested value ${path}`);
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
                if (metadata.selector?.component === 'ModelSelector') {                                                                            
                    const provider = getNestedValue(settings, metadata.selector.providerField);                                                    
                                                                                                                                                   
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
                if (category === 'Models' || category === "Providers") {
                    return (
                        <Box key={category} id={category}>
                            <ErrorBoundary
                                fallback={<ModelConfigErrorFallback />}
                                onError={(error, errorInfo) => {
                                    console.error('Error in ModelConfigBuilder:', error, errorInfo);
                                }}
                            >
                                <SettingsListBuilder
                                    settings={settings || {}}
                                    onSettingsChange={(updatedConfigs) => {
                                        onSettingChange(metadataList[0].key, updatedConfigs);
                                    }}
                                    configType={metadataList[0].key}
                                    configClass={
                                        category === 'Models' ? 
                                            ModelProviderConfig : 
                                            ProviderConfig
                                    }
                                    defaults={
                                        category === 'Models' ? 
                                            MODEL_CONFIG_DEFAULTS : 
                                            PROVIDER_CONFIG_DEFAULTS
                                    }
                                />
                            </ErrorBoundary>
                        </Box>
                    );
                }

                return (
                    <Box
                        key={category}
                        id={category}
                    >
                        <Typography variant="h6" gutterBottom>
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
                    </Box>
                );
            })}
        </Box>
    );
};
