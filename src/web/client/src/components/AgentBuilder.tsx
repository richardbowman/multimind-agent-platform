import React, { useState, useEffect } from 'react';
import {
    Box,
    Paper,
    Typography,
    Button,
    FormControl,
    Chip,
    TextField,
    Select,
    MenuItem,
    InputLabel,
    FormControlLabel,
    Checkbox, IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Collapse,
    Tabs,
    Tab,
    Autocomplete
} from '@mui/material';
import { DataGrid, GridColDef, GridActionsCellItem, GridRenderCellParams, GridRowModel } from '@mui/x-data-grid';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { Settings } from '../../../../tools/settings';
import { useIPCService } from '../contexts/IPCContext';

interface AgentBuilderProps {
    settings: Settings;
    onSettingsChange: (settings: Settings) => void;
}

export const AgentBuilder: React.FC<AgentBuilderProps> = ({
    settings,
    onSettingsChange
}) => {
    // Combine both agent sources
    const allAgents = {
        ...(settings.agents || {}),
        ...(settings.agentBuilder || {})
    };

    const ipcService = useIPCService();
    const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
    const [agentForm, setAgentForm] = useState<any>({
        executors: [],
        config: {
            stepSequences: []
        }
    });

    const [executorOptions, setExecutorOptions] = useState<{ value: string, label: string }[]>([]);
    const [currentTab, setCurrentTab] = useState(0);

    useEffect(() => {
        const fetchExecutorTypes = async () => {
            try {
                const types = await ipcService.getRPC().getExecutorTypes();
                setExecutorOptions(types.map(type => ({
                    value: type,
                    label: type
                })));
            } catch (error) {
                console.error('Failed to fetch executor types:', error);
            }
        };

        fetchExecutorTypes();
    }, []);

    const handleEditClick = (agentId: string) => {
        setEditingAgentId(agentId);
        // Get the agent config from either agentBuilder or agents
        const agentConfig = settings.agentBuilder?.[agentId] || settings.agents?.[agentId];

        if (!agentConfig) {
            console.error(`Agent config not found for ID: ${agentId}`);
            return;
        }

        // Ensure executors array exists and has proper structure
        const executors = agentConfig.config?.executors?.map(executor => ({
            className: executor.className || '',
            config: executor.config || {}
        })) || [];

        setAgentForm({
            name: agentConfig.name || '',
            description: agentConfig.description || 'A helpful general purpose agent',
            purpose: agentConfig.config?.purpose || '',
            finalInstructions: agentConfig.config?.finalInstructions || '',
            plannerType: agentConfig.config?.plannerType || 'nextStep',
            autoRespondChannelIds: agentConfig.config?.autoRespondChannelIds || '',
            enabled: agentConfig.enabled ?? true,
            executors: executors,
            config: {
                stepSequences: agentConfig.config?.stepSequences || []
            }
        });
    };

    const handleFormChange = (field: string, value: any) => {
        setAgentForm(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSaveAgent = () => {
        if (editingAgentId) {
            const updatedSettings = {
                ...settings,
                agentBuilder: {
                    ...settings.agentBuilder,
                    [editingAgentId]: {
                        ...agentForm,
                        // Preserve any Provided fields not in the form
                        ...(settings.agentBuilder?.[editingAgentId] || {})
                    }
                }
            };
            onSettingsChange(updatedSettings);
            setEditingAgentId(null);
            setAgentForm({});
        }
    };

    const handleDeleteAgent = (agentId: string) => {
        const newAgentBuilder = { ...settings.agentBuilder };
        delete newAgentBuilder[agentId];
        onSettingsChange({
            ...settings,
            agentBuilder: newAgentBuilder
        });
    };

    return (
        <Box>
            <Typography variant="h6" gutterBottom sx={{
                mb: 2,
                pb: 1,
                borderBottom: '1px solid',
                borderColor: 'divider'
            }}>
                Agent Builder
            </Typography>

            <Box sx={{ height: 400, width: '100%' }}>
                <DataGrid
                    rows={Object.entries(allAgents).map(([id, config]) => ({
                        id,
                        name: config.name || id,
                        description: config.description || '',
                        className: config.className || '',
                        type: settings.agents?.[id] ? 'Provided' : 'Custom',
                        enabled: config.enabled ?? true
                    }))}
                    columns={[
                        {
                            field: 'enabled',
                            headerName: 'Enabled',
                            width: 100,
                            type: 'boolean',
                            renderCell: (params) => (
                                <Checkbox
                                    checked={params.value}
                                    disabled
                                    color="primary"
                                />
                            )
                        },
                        {
                            field: 'name',
                            headerName: 'Name',
                            flex: 1,
                            renderCell: (params) => (
                                <Typography variant="body2">{params.value}</Typography>
                            )
                        },
                        {
                            field: 'className',
                            headerName: 'Class',
                            flex: 1,
                            renderCell: (params) => (
                                <Typography variant="body2" color="text.secondary">
                                    {params.value}
                                </Typography>
                            )
                        },
                        {
                            field: 'description',
                            headerName: 'Description',
                            flex: 2,
                            renderCell: (params) => (
                                <Typography variant="body2" color="text.secondary">
                                    {params.value}
                                </Typography>
                            )
                        },
                        {
                            field: 'type',
                            headerName: 'Type',
                            width: 120,
                            renderCell: (params) => (
                                params.value === 'Provided' ? (
                                    <Chip
                                        label="Provided"
                                        color="primary"
                                        size="small"
                                    />
                                ) : <Chip
                                    label="Custom"
                                    color="secondary"
                                    size="small"
                                />
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
                                    onClick={() => handleEditClick(params.id as string)}
                                />,
                                params.row.type === 'Custom' && (
                                    <GridActionsCellItem
                                        icon={<DeleteIcon />}
                                        label="Delete"
                                        onClick={() => handleDeleteAgent(params.id as string)}
                                        color="error"
                                    />
                                )
                            ].filter(Boolean)
                        }
                    ]}
                    pageSizeOptions={[5, 10, 25]}
                    initialState={{
                        pagination: {
                            paginationModel: { page: 0, pageSize: 10 },
                        },
                    }}
                />
                {/* Edit Agent Dialog */}
                <Dialog
                    open={!!editingAgentId}
                    onClose={() => setEditingAgentId(null)}
                    maxWidth="lg"
                    fullWidth
                >
                    <DialogTitle>Edit Agent</DialogTitle>
                    <DialogContent>
                        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                            <Tabs value={currentTab} onChange={(e, newValue) => setCurrentTab(newValue)}>
                                <Tab label="Agent Configuration" />
                                <Tab label="Step Sequences" />
                            </Tabs>
                        </Box>

                        {currentTab === 0 && (
                            <Box sx={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: 3,
                                pt: 2
                            }}>
                                {/* Left Column */}
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <TextField
                                        label="Agent Name"
                                        value={agentForm.name || ''}
                                        onChange={(e) => handleFormChange('name', e.target.value)}
                                        fullWidth
                                        margin="normal"
                                    />

                                    <TextField
                                        label="Description"
                                        value={agentForm.description || ''}
                                        onChange={(e) => handleFormChange('description', e.target.value)}
                                        fullWidth
                                        margin="normal"
                                        multiline
                                        rows={2}
                                    />

                                    <TextField
                                        label="Purpose"
                                        value={agentForm.purpose || ''}
                                        onChange={(e) => handleFormChange('purpose', e.target.value)}
                                        fullWidth
                                        margin="normal"
                                        multiline
                                        rows={3}
                                        required
                                    />

                                    <TextField
                                        label="Final Instructions"
                                        value={agentForm.finalInstructions || ''}
                                        onChange={(e) => handleFormChange('finalInstructions', e.target.value)}
                                        fullWidth
                                        margin="normal"
                                        multiline
                                        rows={4}
                                        required
                                    />

                                    <FormControl fullWidth margin="normal">
                                        <InputLabel>Planner Type</InputLabel>
                                        <Select
                                            value={agentForm.plannerType || 'nextStep'}
                                            label="Planner Type"
                                            onChange={(e) => handleFormChange('plannerType', e.target.value)}
                                        >
                                            <MenuItem value="nextStep">Next Step</MenuItem>
                                        </Select>
                                    </FormControl>

                                    <TextField
                                        label="Auto Respond Channels"
                                        value={agentForm.autoRespondChannelIds || ''}
                                        onChange={(e) => handleFormChange('autoRespondChannelIds', e.target.value)}
                                        fullWidth
                                        margin="normal"
                                        helperText="Comma separated list of channel IDs"
                                    />

                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={agentForm.enabled ?? true}
                                                onChange={(e) => handleFormChange('enabled', e.target.checked)}
                                            />
                                        }
                                        label="Enabled"
                                    />

                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={agentForm.supportsDelegation || false}
                                                onChange={(e) => handleFormChange('supportsDelegation', e.target.checked)}
                                            />
                                        }
                                        label="Supports Delegation"
                                        sx={{ mt: 1 }}
                                    />
                                </Box>

                                {/* Right Column - Executors */}
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <Typography variant="subtitle1" gutterBottom>
                                        Executors
                                    </Typography>

                                    {agentForm.executors?.map((executor: any, index: number) => (
                                        <Paper key={index} sx={{ p: 2, mb: 1 }}>
                                            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                                <FormControl fullWidth size="small">
                                                    <InputLabel>Executor Type</InputLabel>
                                                    <Select
                                                        value={executor.className || ''}
                                                        label="Executor Type"
                                                        onChange={(e) => {
                                                            const newExecutors = [...agentForm.executors];
                                                            newExecutors[index].className = e.target.value;
                                                            handleFormChange('executors', newExecutors);
                                                        }}
                                                    >
                                                        {executorOptions.map(option => (
                                                            <MenuItem key={option.value} value={option.value}>
                                                                {option.label}
                                                            </MenuItem>
                                                        ))}
                                                    </Select>
                                                </FormControl>

                                                <IconButton
                                                    onClick={() => {
                                                        const newExecutors = [...agentForm.executors];
                                                        newExecutors.splice(index, 1);
                                                        handleFormChange('executors', newExecutors);
                                                    }}
                                                    size="small"
                                                    color="error"
                                                >
                                                    <DeleteIcon fontSize="small" />
                                                </IconButton>
                                            </Box>

                                            <Box sx={{ mt: 1 }}>
                                                <Button
                                                    size="small"
                                                    startIcon={executor.showConfig ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                                    onClick={() => {
                                                        const newExecutors = [...agentForm.executors];
                                                        newExecutors[index].showConfig = !executor.showConfig;
                                                        handleFormChange('executors', newExecutors);
                                                    }}
                                                >
                                                    {executor.showConfig ? 'Hide' : 'Show'} Configuration
                                                </Button>

                                                <Collapse in={executor.showConfig}>
                                                    <TextField
                                                        label="Configuration (JSON)"
                                                        value={JSON.stringify(executor.config || {}, null, 2)}
                                                        onChange={(e) => {
                                                            try {
                                                                const newExecutors = [...agentForm.executors];
                                                                newExecutors[index].config = JSON.parse(e.target.value);
                                                                handleFormChange('executors', newExecutors);
                                                            } catch (error) {
                                                                // Invalid JSON - ignore
                                                            }
                                                        }}
                                                        fullWidth
                                                        margin="normal"
                                                        multiline
                                                        rows={3}
                                                    />
                                                </Collapse>
                                            </Box>
                                        </Paper>
                                    ))}

                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={() => {
                                            const newExecutors = [...(agentForm.executors || [])];
                                            newExecutors.push({
                                                className: '',
                                                config: {}
                                            });
                                            handleFormChange('executors', newExecutors);
                                        }}
                                    >
                                        Add Executor
                                    </Button>
                                </Box>
                            </Box>)}
                        {currentTab === 1 && (
                            <Box sx={{ pt: 2 }}>
                                <Typography variant="h6" gutterBottom>
                                    Step Sequences
                                </Typography>
                                <Typography color="text.secondary" sx={{ mb: 3 }}>
                                    Define common workflows and step sequences for this agent
                                </Typography>

                                {agentForm.config?.stepSequences?.map((sequence: any, index: number) => (
                                    <Paper key={index} sx={{ p: 2, mb: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Box>
                                                <Typography variant="subtitle1">{sequence.name}</Typography>
                                                <Typography variant="body2" color="text.secondary">
                                                    {sequence.description}
                                                </Typography>
                                            </Box>
                                            <IconButton
                                                onClick={() => {
                                                    const newSequences = [...agentForm.config.stepSequences];
                                                    newSequences.splice(index, 1);
                                                    handleFormChange('config', {
                                                        ...agentForm.config,
                                                        stepSequences: newSequences
                                                    });
                                                }}
                                                color="error"
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </Box>

                                        <Box sx={{ mt: 2 }}>
                                            {sequence.steps.map((step: any, stepIndex: number) => (
                                                <Box key={stepIndex} sx={{ display: 'flex', gap: 2, mb: 1 }}>
                                                    <Autocomplete
                                                        value={step.executor || ''}
                                                        onChange={(e, newValue) => {
                                                            const newSequences = [...agentForm.config.stepSequences];
                                                            newSequences[index].steps[stepIndex].executor = newValue || '';
                                                            handleFormChange('config', {
                                                                ...agentForm.config,
                                                                stepSequences: newSequences
                                                            });
                                                        }}
                                                        options={executorOptions?.map(option => option.value) || []}
                                                        renderInput={(params) => (
                                                            <TextField
                                                                {...params}
                                                                label="Executor"
                                                                fullWidth
                                                                size="small"
                                                            />
                                                        )}
                                                        freeSolo
                                                        fullWidth
                                                    />
                                                    <TextField
                                                        label="Description"
                                                        value={step.description}
                                                        onChange={(e) => {
                                                            const newSequences = [...agentForm.config.stepSequences];
                                                            newSequences[index].steps[stepIndex].description = e.target.value;
                                                            handleFormChange('config', {
                                                                ...agentForm.config,
                                                                stepSequences: newSequences
                                                            });
                                                        }}
                                                        fullWidth
                                                        size="small"
                                                    />
                                                    <IconButton
                                                        onClick={() => {
                                                            const newSequences = [...agentForm.config.stepSequences];
                                                            newSequences[index].steps.splice(stepIndex, 1);
                                                            handleFormChange('config', {
                                                                ...agentForm.config,
                                                                stepSequences: newSequences
                                                            });
                                                        }}
                                                        color="error"
                                                    >
                                                        <DeleteIcon />
                                                    </IconButton>
                                                </Box>
                                            ))}
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                onClick={() => {
                                                    const newSequences = [...agentForm.config.stepSequences];
                                                    newSequences[index].steps.push({
                                                        executor: '',
                                                        description: ''
                                                    });
                                                    handleFormChange('config', {
                                                        ...agentForm.config,
                                                        stepSequences: newSequences
                                                    });
                                                }}
                                            >
                                                Add Step
                                            </Button>
                                        </Box>
                                    </Paper>
                                ))}

                                <Button
                                    variant="contained"
                                    size="small"
                                    onClick={() => {
                                        handleFormChange('config', {
                                            ...agentForm.config,
                                            stepSequences: [
                                                ...(agentForm.config?.stepSequences || []),
                                                {
                                                    id: `sequence-${Date.now()}`,
                                                    name: 'New Sequence',
                                                    description: '',
                                                    steps: []
                                                }
                                            ]
                                        });
                                    }}
                                >
                                    Add New Sequence
                                </Button>
                            </Box>
                        )}

                    </DialogContent>
                    <DialogActions>
                        <Button onClick={() => setEditingAgentId(null)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveAgent} variant="contained">
                            Save
                        </Button>
                    </DialogActions>
                </Dialog>

                <Button
                    variant="contained"
                    onClick={() => {
                        const newAgentId = `agent-${Date.now()}`;
                        onSettingsChange({
                            ...settings,
                            agentBuilder: {
                                ...settings.agentBuilder,
                                [newAgentId]: {
                                    name: '',
                                    description: '',
                                    purpose: '',
                                    finalInstructions: '',
                                    plannerType: 'nextStep',
                                    autoRespondChannelIds: '',
                                    enabled: true,
                                    supportsDelegation: false,
                                    executors: []
                                }
                            }
                        });
                    }}
                >
                    Add New Agent
                </Button>
            </Box>
        </Box>
    );
};
