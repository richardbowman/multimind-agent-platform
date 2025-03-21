import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    Button,
    FormControl,
    TextField,
    Select,
    MenuItem,
    InputLabel,
    FormControlLabel,
    Checkbox,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack,
    InputAdornment
} from '@mui/material';
import ModelSelector from './ModelSelector';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import { DataGrid, GridColDef, GridActionsCellItem } from '@mui/x-data-grid';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { Settings } from '../../../../tools/settings';

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
    const [configForm, setConfigForm] = useState<any>({
        type: 'conversation',
        provider: 'openrouter',
        model: '',
        baseUrl: '',
        maxTokensPerMinute: 20000,
        defaultDelayMs: 1000,
        windowSizeMs: 60000
    });

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
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: '1fr',
                        gap: 2,
                        pt: 2
                    }}>
                        <FormControl fullWidth margin="normal">
                            <InputLabel>Model Type</InputLabel>
                            <Select
                                value={configForm.type}
                                label="Model Type"
                                onChange={(e) => handleFormChange('type', e.target.value)}
                            >
                                <MenuItem value="conversation">Conversation</MenuItem>
                                <MenuItem value="reasoning">Reasoning</MenuItem>
                                <MenuItem value="advancedReasoning">Advanced Reasoning</MenuItem>
                                <MenuItem value="document">Document</MenuItem>
                                <MenuItem value="embeddings">Embeddings</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl fullWidth margin="normal">
                            <InputLabel>Provider</InputLabel>
                            <Select
                                value={configForm.providerId}
                                label="Provider"
                                onChange={(e) => handleFormChange('providerId', e.target.value)}
                            >
                                {settings.providers.map(provider => (
                                    <MenuItem key={provider.id} value={provider.id}>
                                        {provider.type} ({provider.id})
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <TextField
                            label="Model"
                            value={configForm.model}
                            onChange={(e) => handleFormChange('model', e.target.value)}
                            fullWidth
                            margin="normal"
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            onClick={() => setShowModelSelector(true)}
                                            edge="end"
                                        >
                                            <SearchIcon />
                                        </IconButton>
                                    </InputAdornment>
                                )
                            }}
                        />
                        <Dialog
                            open={showModelSelector}
                            onClose={() => setShowModelSelector(false)}
                            maxWidth="md"
                            fullWidth
                        >
                            <DialogTitle>Select Model</DialogTitle>
                            <DialogContent>
                                <ModelSelector
                                    provider={configForm.provider}
                                    value={configForm.model}
                                    onChange={(value) => {
                                        handleFormChange('model', value);
                                        setShowModelSelector(false);
                                    }}
                                />
                            </DialogContent>
                        </Dialog>

                        <TextField
                            label="Base URL"
                            value={configForm.baseUrl}
                            onChange={(e) => handleFormChange('baseUrl', e.target.value)}
                            fullWidth
                            margin="normal"
                        />

                        <TextField
                            label="Max Tokens Per Minute"
                            type="number"
                            value={configForm.maxTokensPerMinute}
                            onChange={(e) => handleFormChange('maxTokensPerMinute', Number(e.target.value))}
                            fullWidth
                            margin="normal"
                        />

                        <TextField
                            label="Default Delay (ms)"
                            type="number"
                            value={configForm.defaultDelayMs}
                            onChange={(e) => handleFormChange('defaultDelayMs', Number(e.target.value))}
                            fullWidth
                            margin="normal"
                        />

                        <TextField
                            label="Window Size (ms)"
                            type="number"
                            value={configForm.windowSizeMs}
                            onChange={(e) => handleFormChange('windowSizeMs', Number(e.target.value))}
                            fullWidth
                            margin="normal"
                        />
                    </Box>
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
