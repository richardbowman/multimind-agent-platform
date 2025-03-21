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
import { SettingsFormBuilder } from './SettingsFormBuilder';

interface ModelConfigBuilderProps {
    settings: Settings;
    onSettingsChange: (settings: Settings) => void;
}

export const ModelConfigBuilder: React.FC<ModelConfigBuilderProps> = ({
    settings,
    onSettingsChange
}) => {
    const [editingConfigId, setEditingConfigId] = useState<number | null>(null);
    const [showModelSelector, setShowModelSelector] = useState(false);
    const [configForm, setConfigForm] = useState<any>({});

    class ModelConfig {
        @ClientSettings({
            label: 'Model Type',
            category: 'Model',
            type: 'select',
            options: ['conversation', 'reasoning', 'advancedReasoning', 'document', 'embeddings'],
            required: true
        })
        type: string = 'conversation';

        @ClientSettings({
            label: 'Provider',
            category: 'Model',
            type: 'select',
            options: settings.providers?.map(p => p.id) || [],
            required: true
        })
        providerId: string = 'openrouter-default';

        @ClientSettings({
            label: 'Model',
            category: 'Model',
            type: 'text',
            required: true
        })
        model: string = '';

        @ClientSettings({
            label: 'Base URL',
            category: 'Connection',
            type: 'text',
            required: false
        })
        baseUrl: string = '';

        @ClientSettings({
            label: 'Max Tokens Per Minute',
            category: 'Rate Limiting',
            type: 'number',
            required: true
        })
        maxTokensPerMinute: number = 20000;

        @ClientSettings({
            label: 'Default Delay (ms)',
            category: 'Rate Limiting',
            type: 'number',
            required: true
        })
        defaultDelayMs: number = 1000;

        @ClientSettings({
            label: 'Window Size (ms)',
            category: 'Rate Limiting',
            type: 'number',
            required: true
        })
        windowSizeMs: number = 60000;
    }

    const configMetadata = useMemo(() => {
        const instance = new ModelConfig();
        return getClientSettingsMetadata(instance);
    }, [settings.providers]);

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
        setConfigForm(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSaveConfig = () => {
        const newConfigs = [...settings.modelConfigs];
        
        if (editingConfigId !== null && editingConfigId >= 0) {
            // Editing existing config
            newConfigs[editingConfigId] = configForm;
        } else {
            // Adding new config
            newConfigs.push(configForm);
        }
        
        onSettingsChange({
            ...settings,
            modelConfigs: newConfigs
        });
        setEditingConfigId(null);
        setConfigForm({
            type: 'conversation',
            providerId: 'openrouter-default',
            model: ''
        });
    };

    const handleDeleteConfig = (index: number) => {
        const newConfigs = [...settings.modelConfigs];
        newConfigs.splice(index, 1);
        onSettingsChange({
            ...settings,
            modelConfigs: newConfigs
        });
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
                    Model Configurations
                </Typography>
                <IconButton
                    color="primary"
                    onClick={() => {
                        setEditingConfigId(-1);
                        setConfigForm({
                            type: 'conversation',
                            providerId: 'openrouter-default',
                            model: ''
                        });
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
                    rows={settings?.modelConfigs?.map((config, index) => ({
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
                            // Handle model selection if needed
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
        </Box>
    );
};
