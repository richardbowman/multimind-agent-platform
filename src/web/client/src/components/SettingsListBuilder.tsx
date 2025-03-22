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
import ModelSelector from './ModelSelector';
import { SettingsFormBuilder } from './SettingsFormBuilder';
import { getClientSettingsMetadata, SettingMetadata } from '../../../../tools/settingsDecorators';

interface SettingsListConfigBuilderProps {
    settings: any;
    onSettingsChange: (updatedConfigs: any) => void;
    metadata: SettingMetadata,
    configClass: any; // The class to use for new configs (e.g. ModelProviderConfig or ProviderConfig)
    defaults?: Record<string, any>; // Default configurations if needed
}

export const SettingsListBuilder: React.FC<SettingsListConfigBuilderProps> = ({
    settings,
    metadata,
    defaults,
    configClass,
    onSettingsChange
}) => {
    const { key: configType, label: header } = metadata;

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
        
        return result;
    }, [configType]);

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
        setConfigForm(settings[configType][index]);
    };

    const handleFormChange = (field: string, value: any) => {
        const defaultKeys = Object.entries(configMetadata).filter(([field, meta]) => meta.matchDefaults).map(([field, meta]) => field);

        setConfigForm(prev => {
            let newData = {
                ...prev,
                [field]: value
            }

            // Apply defaults if user changed a key field
            if (defaults && defaultKeys?.includes(field)) {
                // see if a default key matches a vlaue in the 
                const match = defaults.find(d => defaultKeys.every(k => d[k] === newData[k]));

                newData = {
                    ...newData,
                    ...match,
                };
            }
        
            return newData;
        });
    };

    const handleSaveConfig = () => {
        const newConfigs = [...settings[configType] || []];
        

        if (editingConfigId !== null && editingConfigId >= 0) {
            // Editing existing config
            newConfigs[editingConfigId] = configForm;
        } else {
            // Adding new config
            newConfigs.push(configForm);
        }
        
        onSettingsChange(newConfigs);
        
        setEditingConfigId(null);
        setConfigForm(new configClass());
    };

    const handleDeleteConfig = (index: number) => {
        let newConfigs = [...settings.modelConfigs || []];
        newConfigs.splice(index, 1);
        onSettingsChange(newConfigs);
    };

    const columns = useMemo(() => {
        const baseColumns: GridColDef[] = Object.entries(configMetadata)
            .filter(([_, meta]) => !meta.sensitive && meta.showInList)
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
    }, [configMetadata, settings]);

    return (
        <Box sx={{mt: 3}}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{
                mb: 2,
                pb: 1
            }}>
                <Box>
                    <Typography variant="h6" gutterBottom>
                        {header}
                    </Typography>
                    {metadata.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                            {metadata.description}
                        </Typography>
                    )}
                </Box>
                <IconButton
                    color="primary"
                    onClick={() => {
                        setEditingConfigId(-1);
                        setConfigForm(new configClass());
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
                    {editingConfigId === -1 ? 'Add New Configuration' : 'Edit Configuration'}
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
