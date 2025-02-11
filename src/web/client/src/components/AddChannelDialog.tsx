import React, { useState, useEffect } from 'react';
import {
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Checkbox,
    ListItemText,
    Typography, Grid,
    Card,
    CardContent,
    CardActionArea,
    Autocomplete,
    Chip
} from '@mui/material';
import { GoalTemplate } from '../../../../schemas/goalTemplateSchema';
import { useChannels } from '../contexts/ChannelContext';
import { ChannelHandle, createChannelHandle } from '../../../../shared/channelTypes';
import { useIPCService } from '../contexts/IPCContext';
import { useDataContext } from '../contexts/DataContext';
import { UUID } from '../../../../types/uuid';
import { ChatHandle } from '../../../../types/chatHandle';

interface AddChannelDialogProps {
    open: boolean;
    onClose: () => void;
    editingChannelId: string | null;
    initialData?: {
        name: ChannelHandle | null;
        description: string;
        members: ChatHandle[];
        goalTemplate: ChannelHandle | null;
        defaultResponderId: ChatHandle | null;
    };
}

export const AddChannelDialog: React.FC<AddChannelDialogProps> = ({
    open,
    onClose,
    editingChannelId,
    initialData
}) => {
    const ipcService = useIPCService();
    const {handles} = useDataContext();
    const {deleteChannel, createChannel, fetchChannels} = useChannels();
    const [channelName, setChannelName] = useState<ChannelHandle|null>(null);
    const [channelNameError, setChannelNameError] = useState(false);
    const [description, setDescription] = useState('');
    const [selectedAgents, setSelectedAgents] = useState<UUID[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<ChannelHandle | null>(null);
    const [defaultResponderId, setDefaultResponderId] = useState<UUID | null>(null);
    const [templates, setTemplates] = useState<GoalTemplate[]>([]);

    useEffect(() => {
        if (initialData) {
            setChannelName(initialData.name);
            setDescription(initialData.description);
            setSelectedAgents(initialData.members);
            setSelectedTemplate(initialData.goalTemplate);
            setDefaultResponderId(initialData.defaultResponderId);
        } else {
            setChannelName(null);
            setDescription('');
            setSelectedAgents([]);
            setSelectedTemplate(null);
            setDefaultResponderId(null);
        }
    }, [initialData, handles]);

    useEffect(() => {
        ipcService.getRPC().loadGoalTemplates().then(setTemplates);
    }, []);

    const [lastSelectedTemplateName, setLastSelectedTemplateName] = useState<string>('');
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    const handleTemplateSelect = (templateId: ChannelHandle) => {
        setSelectedTemplate(templateId);
        const selectedTemplate = templates.find(t => t.id === templateId);
        if (selectedTemplate) {
            const agentIds = selectedTemplate.supportingAgents.map(handle => handles.find(h => h.handle === handle)?.id);
            setSelectedAgents(agentIds.filter(a => (a !== undefined)));
        } else {
            setSelectedAgents([]);
        }
        
        if (selectedTemplate?.defaultResponder) {
            setDefaultResponderId(handles.find(h => h.handle === selectedTemplate.defaultResponder)?.id||null);
        }
        
        if (!channelName?.trim() || !channelName?.startsWith('#') || channelName === lastSelectedTemplateName) {
            setChannelName(templateId);
        }
        setLastSelectedTemplateName(templateId);
    };

    const handleSaveChannel = async () => {
        if (!channelName || !channelName.trim() || !channelName.startsWith('#')) {
            setChannelNameError(true);
            return;
        }

        try {
            // Convert defaultResponderId to handle
            const defaultResponder = defaultResponderId 
                ? handles.find(h => h.id === defaultResponderId)?.handle || defaultResponderId
                : undefined;

            const params = {
                name: channelName,
                description,
                members: selectedAgents,
                goalTemplate: selectedTemplate,
                defaultResponder
            };

            if (editingChannelId) {
                await deleteChannel(editingChannelId);
                await createChannel(params);
            } else {
                await createChannel(params);
            }

            onClose();
            fetchChannels();
        } catch (error) {
            console.error('Failed to save channel:', error);
        }
    };

    const handleDeleteChannel = async () => {
        if (editingChannelId) {
            try {
                await deleteChannel(editingChannelId);
                fetchChannels();
                setDeleteConfirmOpen(false);
                onClose();
            } catch (error) {
                console.error('Failed to delete channel:', error);
            }
        }
    };

    return (
        <>
            <Dialog 
                open={open} 
                onClose={onClose}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle>
                    {editingChannelId ? `Edit Channel "${channelName}"` : 'Create New Channel'}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Channel Name"
                        fullWidth
                        value={channelName || ''}
                        onChange={(e) => {
                            const value = e.target.value;
                            // Allow empty value for backspace
                            if (value === '') {
                                setChannelName(null);
                                setChannelNameError(true);
                                return;
                            }
                            // Only add # if it's not already there
                            const newName = createChannelHandle(value.startsWith('#') ? value : `#${value}`);
                            setChannelName(newName);
                            setChannelNameError(false);
                        }}
                        InputLabelProps={{
                            shrink: !!channelName,
                        }}
                        error={channelNameError}
                        helperText={channelNameError ? "Channel name must start with # and not be empty" : "Channel names must start with #"}
                        required
                        sx={{ mb: 2 }}
                    />
                    <TextField
                        margin="dense"
                        label="Description"
                        fullWidth
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        sx={{ mb: 2 }}
                    />
                    <Typography variant="h6" sx={{ mb: 2 }}>Select Goal Template</Typography>
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        {templates.map(template => (
                            <Grid item xs={4} key={template.id}>
                                <Card 
                                    variant={selectedTemplate === template.id ? 'elevation' : 'outlined'}
                                    sx={{
                                        borderColor: selectedTemplate === template.id ? 'primary.main' : 'divider',
                                        height: '100%'
                                    }}
                                >
                                    <CardActionArea 
                                        onClick={() => handleTemplateSelect(template.id)}
                                        sx={{ height: '100%' }}
                                    >
                                        <CardContent>
                                            <Typography variant="h6" gutterBottom>
                                                {template.name}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary">
                                                {template.description}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                                Supporting Agents: {template.supportingAgents
                                                    .map(idOrHandle => 
                                                        idOrHandle.startsWith('@') 
                                                            ? idOrHandle 
                                                            : handles.find(h => h.id === idOrHandle)?.handle || 'Unknown'
                                                    )
                                                    .join(', ')}
                                            </Typography>
                                        </CardContent>
                                    </CardActionArea>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>

                    <Autocomplete
                        multiple
                        options={handles}
                        value={handles.filter(handle => selectedAgents.includes(handle.id))}
                        onChange={(_, newValue) => {
                            setSelectedAgents(newValue.map(handle => handle.id));
                        }}
                        getOptionLabel={(option) => option.handle}
                        isOptionEqualToValue={(option, value) => 
                            option.handle === value.id
                        }
                        renderInput={(params) => (
                            <TextField
                                {...params}
                                label="Add Agents"
                                placeholder="Type to search agents..."
                            />
                        )}
                        renderTags={(value, getTagProps) =>
                            value.map((option, index) => (
                                <Chip
                                    {...getTagProps({ index })}
                                    key={option.id}
                                    label={option.handle}
                                    size="small"
                                    sx={{ mr: 1 }}
                                />
                            ))
                        }
                        renderOption={(props, option) => (
                            <li {...props} key={option.id}>
                                {option.handle}
                            </li>
                        )}
                        sx={{ mb: 2 }}
                    />

                    <FormControl fullWidth>
                        <InputLabel>Default Responding Agent</InputLabel>
                        <Select
                            value={defaultResponderId || ''}
                            onChange={(e) => setDefaultResponderId(e.target.value as string)}
                            disabled={selectedAgents.length === 0}
                        >
                            <MenuItem value="">None</MenuItem>
                            {selectedAgents.map((agentId) => (
                                <MenuItem key={agentId} value={agentId}>
                                    {agentId.startsWith('@') 
                                        ? agentId 
                                        : handles.find(h => h.id === agentId)?.handle || 'Unknown'}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    {editingChannelId && (
                        <Button 
                            onClick={() => setDeleteConfirmOpen(true)}
                            color="error"
                            sx={{ mr: 'auto' }}
                        >
                            Delete Channel
                        </Button>
                    )}
                    <Button onClick={onClose}>Cancel</Button>
                    <Button 
                        onClick={handleSaveChannel} 
                        color="primary"
                        disabled={!channelName?.trim()}
                    >
                        {editingChannelId ? 'Save' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={deleteConfirmOpen}
                onClose={() => setDeleteConfirmOpen(false)}
            >
                <DialogTitle>Delete Channel</DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to delete channel "{channelName}"?
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
                    <Button 
                        color="error"
                        onClick={handleDeleteChannel}
                    >
                        Delete
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};
