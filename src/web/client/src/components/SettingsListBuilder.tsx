import React, { useState, useMemo } from 'react';
import {
    Box,
    Typography,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack,
    Button
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { DataGrid, GridColDef, GridActionsCellItem } from '@mui/x-data-grid';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { Settings } from '../../../../tools/settings';
import ModelSelector from './ModelSelector';
import { SettingsFormBuilder } from './SettingsFormBuilder';
import { getClientSettingsMetadata } from '../../../../tools/settingsDecorators';
import { ModelProviderConfig } from '../../../../tools/modelProviderConfig';
import { PROVIDER_CONFIG_DEFAULTS, ProviderConfig } from '../../../../tools/providerConfig';
import { LLMProvider } from '../../../../llm/types/LLMProvider';

interface SettingsListConfigBuilderProps {
    settings: any;
    onSettingsChange: (updatedConfigs: any) => void;
    configType: string; // e.g. 'modelConfigs' or 'providers'
    configClass: any; // The class to use for new configs (e.g. ModelProviderConfig or ProviderConfig)
    defaults?: Record<string, any>; // Default configurations if needed
}

export const SettingsListBuilder: React.FC<SettingsListConfigBuilderProps> = ({
    settings,
    configType,
    onSettingsChange
}) => {
    const [editingConfigId, setEditingConfigId] = useState<number | null>(null);
    const [modelDialog, setModelDialog] = useState<{
        open: boolean;
        key: string;
        provider: string;
    }>({
        open: false,
        key: '',
        provider: ''
    });
    const [configForm, setConfigForm] = useState<any>({});

    // Provider-specific default configurations
    const providerDefaults = PROVIDER_CONFIG_DEFAULTS;

    const configMetadata = useMemo(() => {
        const instance = new configClass();
        const metadata = getClientSettingsMetadata(instance);
        
        // Add key property to each metadata entry
        const result = Object.fromEntries(
            Object.entries(metadata).map(([key, meta]) => [
                key,
                { ...meta, key }
            ])
        );
        
        // Add any additional metadata fields if needed
        if (configClass === ProviderConfig) {
            const apiMetadata = getClientSettingsMetadata(new APIConfig());
            Object.entries(apiMetadata).forEach(([key, meta]) => {
                result[`api.${key}`] = {
                    ...meta,
                    key: `api.${key}`,
                    category: 'API Configuration'
                };
            });
        }
        
        return result;
    }, [settings.providers, configType]);

    // Handle provider type change to apply defaults if they exist
    const handleProviderTypeChange = (value: LLMProvider) => {
        setConfigForm(prev => ({
            ...prev,
            type: value
        }));
        
        // Only apply defaults if they exist for this provider
        if (providerDefaults[value]) {
            setConfigForm(prev => ({
                ...prev,
                ...providerDefaults[value]
            }));
        }
    };

    const configCategories = useMemo(() => {
        const categories: Record<string, any[]> = {};
        Object.values(configMetadata).forEach(meta => {
            if (!categories[meta.category]) {
                categories[meta.category] = [];
            }
            categories[meta.category].push(meta);
        });
        return Object.entries(categories);
    }, [configMetadata]);

    const handleEditClick = (index: number) => {
        setEditingConfigId(index);
        setConfigForm(settings.modelConfigs[index]);
    };

    const handleFormChange = (field: string, value: any) => {
        // Special handling for provider type to apply defaults
        if (field === 'type' && configType === 'providers') {
            handleProviderTypeChange(value);
        } else {
            setConfigForm(prev => ({
                ...prev,
                [field]: value
            }));
        }
    };

    const handleSaveConfig = () => {
        let newConfigs;
        
        if (configType === 'providers') {
            newConfigs = [...settings.providers || []];
            
            // Apply provider-specific defaults if needed
            const providerType = configForm.type;
            if (providerType && PROVIDER_CONFIG_DEFAULTS[providerType]) {
                configForm = {
                    ...PROVIDER_CONFIG_DEFAULTS[providerType],
                    ...configForm
                };
            }
        } else {
            newConfigs = [...settings.modelConfigs || []];
        }
        
        if (editingConfigId !== null && editingConfigId >= 0) {
            // Editing existing config
            newConfigs[editingConfigId] = configForm;
        } else {
            // Adding new config
            newConfigs.push(configForm);
        }
        
        if (configType === 'providers') {
            onSettingsChange({
                ...settings,
                providers: newConfigs
            });
        } else {
            onSettingsChange(newConfigs);
        }
        
        setEditingConfigId(null);
        setConfigForm(new configClass());
    };

    const handleDeleteConfig = (index: number) => {
        let newConfigs;
        
        if (configType === 'providers') {
            newConfigs = [...settings.providers || []];
            newConfigs.splice(index, 1);
            onSettingsChange({
                ...settings,
                providers: newConfigs
            });
        } else {
            newConfigs = [...settings.modelConfigs || []];
            newConfigs.splice(index, 1);
            onSettingsChange(newConfigs);
        }
    };

    const columns = useMemo(() => {
        const baseColumns: GridColDef[] = Object.entries(configMetadata)
            .filter(([_, meta]) => !meta.sensitive) // Exclude sensitive fields
            .map(([key, meta]) => ({
                field: key,
                headerName: meta.label,
                flex: 1,
                renderCell: (params) => (
                    <Typography variant="body2">
                        {params.value}
                    </Typography>
                )
            }));

        // Add actions column
        baseColumns.push({
            field: 'actions',
            type: 'actions',
            width: 100,
            getActions: (params) => [
                <GridActionsCellItem
                    icon={<EditIcon />}
                    label="Edit"
                    onClick={() => handleEditClick(params.row.id)}
                />,
                <GridActionsCellItem
                    icon={<DeleteIcon />}
                    label="Delete"
                    onClick={() => handleDeleteConfig(params.row.id)}
                    color="error"
                />
            ]
        });

        return baseColumns;
    }, [configMetadata]);

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{
                mb: 2,
                pb: 1,
                borderBottom: '1px solid',
                borderColor: 'divider'
            }}>
                <Typography variant="h6" gutterBottom>
                    {configType}
                </Typography>
                <IconButton
                    color="primary"
                    onClick={() => {
                        setEditingConfigId(-1);
                        setConfigForm(configType === 'providers' ?
                            new ProviderConfig() :
                            new ModelProviderConfig()
                        );
                    }}
                    sx={{
                        backgroundColor: 'primary.main',
                        color: 'primary.contrastText',
                        '&:hover': {
                            backgroundColor: 'primary.dark'
                        }
                    }}
                >
                    <AddIcon />
                </IconButton>
            </Stack>

            <Box sx={{ height: 400, width: '100%' }}>
                <DataGrid
                    rows={(settings?.[configType] || []).map((config, index) => ({
                        id: index,
                        ...config
                    }))}
                    columns={columns}
                    pageSizeOptions={[5, 10, 25]}
                    initialState={{
                        pagination: {
                            paginationModel: { page: 0, pageSize: 10 },
                        },
                    }}
                />
            </Box>

            <Dialog
                open={editingConfigId !== null}
                onClose={() => setEditingConfigId(null)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    {editingConfigId === -1 ? 'Add New Model Configuration' : 'Edit Model Configuration'}
                </DialogTitle>
                <DialogContent>
                    <SettingsFormBuilder
                        settings={configForm}
                        metadata={configMetadata}
                        categories={configCategories}
                        onSettingChange={handleFormChange}
                        onModelSelect={(key, provider) => {
                            setModelDialog({
                                open: true,
                                key,
                                provider
                            });
                        }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditingConfigId(null)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSaveConfig} variant="contained">
                        Save
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
                        value={configForm[modelDialog.key]}
                        onChange={(newValue) => {
                            handleFormChange(modelDialog.key, newValue);
                            setModelDialog(prev => ({ ...prev, open: false }));
                        }}
                        provider={modelDialog.provider}
                    />
                </DialogContent>
            </Dialog>
        </Box>
    );
};
