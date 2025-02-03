import React, { useState } from 'react';
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
    Collapse
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { Settings } from '../../../../tools/settings';

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

    const handleAgentChange = (agentId: string, field: string, value: any) => {
        onSettingsChange({
            ...settings,
            agentBuilder: {
                ...settings.agentBuilder,
                [agentId]: {
                    ...settings.agentBuilder?.[agentId],
                    [field]: value
                }
            }
        });
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
                        <Box 
                            sx={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                cursor: 'pointer'
                            }}
                            onClick={() => handleAgentChange(agentId, '_expanded', !agentConfig._expanded)}
                        >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {agentConfig._expanded ? (
                                    <ExpandLessIcon fontSize="small" />
                                ) : (
                                    <ExpandMoreIcon fontSize="small" />
                                )}
                                <Typography variant="subtitle1" gutterBottom>
                                    {agentConfig.name || `Agent ${agentId}`}
                                </Typography>
                            </Box>
                            <Box>
                                {settings.agents?.[agentId] && (
                                    <Chip 
                                        label="Existing Agent" 
                                        color="primary" 
                                        size="small"
                                        sx={{ ml: 1 }}
                                    />
                                )}
                                {!settings.agents?.[agentId] && (
                                    <Tooltip title="Delete Agent">
                                        <IconButton
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteAgent(agentId);
                                            }}
                                            color="error"
                                            size="small"
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                )}
                            </Box>
                        </Box>
                        
                        <Collapse in={agentConfig._expanded}>
                            <Divider sx={{ my: 2 }} />
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <TextField
                                label="Agent Name"
                                value={agentConfig.name || ''}
                                onChange={(e) => handleAgentChange(agentId, 'name', e.target.value)}
                                fullWidth
                                margin="normal"
                            />

                            <TextField
                                label="Description"
                                value={agentConfig.description || ''}
                                onChange={(e) => handleAgentChange(agentId, 'description', e.target.value)}
                                fullWidth
                                margin="normal"
                                multiline
                                rows={2}
                            />

                            <TextField
                                label="Purpose"
                                value={agentConfig.purpose || ''}
                                onChange={(e) => handleAgentChange(agentId, 'purpose', e.target.value)}
                                fullWidth
                                margin="normal"
                                multiline
                                rows={3}
                                required
                            />

                            <TextField
                                label="Final Instructions"
                                value={agentConfig.finalInstructions || ''}
                                onChange={(e) => handleAgentChange(agentId, 'finalInstructions', e.target.value)}
                                fullWidth
                                margin="normal"
                                multiline
                                rows={4}
                                required
                            />

                            <FormControl fullWidth margin="normal">
                                <InputLabel>Planner Type</InputLabel>
                                <Select
                                    value={agentConfig.plannerType || 'nextStep'}
                                    label="Planner Type"
                                    onChange={(e) => handleAgentChange(agentId, 'plannerType', e.target.value)}
                                >
                                    <MenuItem value="nextStep">Next Step</MenuItem>
                                </Select>
                            </FormControl>

                            <TextField
                                label="Auto Respond Channels"
                                value={agentConfig.autoRespondChannelIds || ''}
                                onChange={(e) => handleAgentChange(agentId, 'autoRespondChannelIds', e.target.value)}
                                fullWidth
                                margin="normal"
                                helperText="Comma separated list of channel IDs"
                            />

                            <FormControlLabel
                                control={
                                    <Checkbox
                                        checked={agentConfig.enabled ?? true}
                                        onChange={(e) => handleAgentChange(agentId, 'enabled', e.target.checked)}
                                    />
                                }
                                label="Enabled"
                            />
                        </Box>
                    </Collapse>
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
                                    enabled: true
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
