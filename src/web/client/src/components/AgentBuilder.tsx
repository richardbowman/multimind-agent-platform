import React, { useState, useMemo, useEffect } from 'react';
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
    Checkbox,
    Divider,
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions
} from '@mui/material';
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
        executors: []
    });

    const [executorOptions, setExecutorOptions] = useState<{value: string, label: string}[]>([]);

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
        setAgentForm({
            name: agentConfig?.name || '',
            description: agentConfig?.description || '',
            purpose: agentConfig?.purpose || '',
            finalInstructions: agentConfig?.finalInstructions || '',
            plannerType: agentConfig?.plannerType || 'nextStep',
            autoRespondChannelIds: agentConfig?.autoRespondChannelIds || '',
            enabled: agentConfig?.enabled ?? true,
            executors: agentConfig?.executors || []
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
                        // Preserve any existing fields not in the form
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
        <Paper
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
                Agent Builder
            </Typography>
            
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {Object.entries(allAgents).map(([agentId, agentConfig]) => (
                    <Paper key={agentId} sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="subtitle1" gutterBottom>
                                {agentConfig.name || `Agent ${agentId}`}
                            </Typography>
                            <Box>
                                {settings.agents?.[agentId] && (
                                    <Chip 
                                        label="Existing Agent" 
                                        color="primary" 
                                        size="small"
                                        sx={{ ml: 1 }}
                                    />
                                )}
                                <Tooltip title="Edit Agent">
                                    <IconButton
                                        onClick={() => handleEditClick(agentId)}
                                        size="small"
                                    >
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                {!settings.agents?.[agentId] && (
                                    <Tooltip title="Delete Agent">
                                        <IconButton
                                            onClick={() => handleDeleteAgent(agentId)}
                                            color="error"
                                            size="small"
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Box>
                        </Box>

                {/* Edit Agent Dialog */}
                <Dialog
                    open={editingAgentId === agentId}
                    onClose={() => setEditingAgentId(null)}
                    maxWidth="sm"
                    fullWidth
                >
                    <DialogTitle>Edit Agent</DialogTitle>
                    <DialogContent>
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
                                            sx={{ mt: 1 }}
                                        />
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
                        </Box>
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
                    </Paper>
                ))}

                
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
                                    executors: []
                                }
                            }
                        });
                    }}
                >
                    Add New Agent
                </Button>
            </Box>
        </Paper>
    );
};
