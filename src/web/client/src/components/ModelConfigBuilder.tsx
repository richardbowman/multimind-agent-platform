import React, { useState, useMemo } from 'react';
import {
    Box,
    Typography,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack
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

    const configMetadata = useMemo(() => ({
        type: {
            key: 'type',
            label: 'Model Type',
            type: 'select',
            category: 'Model',
            options: ['conversation', 'reasoning', 'advancedReasoning', 'document', 'embeddings'],
            required: true
        },
        providerId: {
            key: 'providerId',
            label: 'Provider',
            type: 'select',
            category: 'Model',
            options: settings.providers?.map(p => p.id) || [],
            required: true
        },
        model: {
            key: 'model',
            label: 'Model',
            type: 'text',
            category: 'Model',
            required: true
        },
        baseUrl: {
            key: 'baseUrl',
            label: 'Base URL',
            type: 'text',
            category: 'Connection',
            required: false
        },
        maxTokensPerMinute: {
            key: 'maxTokensPerMinute',
            label: 'Max Tokens Per Minute',
            type: 'number',
            category: 'Rate Limiting',
            required: true
        },
        defaultDelayMs: {
            key: 'defaultDelayMs',
            label: 'Default Delay (ms)',
            type: 'number',
            category: 'Rate Limiting',
            required: true
        },
        windowSizeMs: {
            key: 'windowSizeMs',
            label: 'Window Size (ms)',
            type: 'number',
            category: 'Rate Limiting',
            required: true
        }
    }), [settings.providers]);

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

    const columns: GridColDef[] = [
        {
            field: 'type',
            headerName: 'Type',
            flex: 1,
            renderCell: (params) => (
                <Typography variant="body2">{params.value}</Typography>
            )
        },
        {
            field: 'provider',
            headerName: 'Provider',
            flex: 1,
            renderCell: (params) => (
                <Typography variant="body2">{params.value}</Typography>
            )
        },
        {
            field: 'model',
            headerName: 'Model',
            flex: 1,
            renderCell: (params) => (
                <Typography variant="body2">{params.value}</Typography>
            )
        },
        {
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
        }
    ];

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
