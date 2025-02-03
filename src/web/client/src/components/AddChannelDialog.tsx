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
    CardActionArea
} from '@mui/material';
import { GoalTemplate } from '../../../../schemas/goalTemplateSchema';
import { useDataContext } from '../contexts/DataContext';
import { ChannelHandle, createChannelHandle } from '../../../../shared/channelTypes';
import { useIPCService } from '../contexts/IPCContext';

interface AddChannelDialogProps {
    open: boolean;
    onClose: () => void;
    editingChannelId: string | null;
    initialData?: {
        name: ChannelHandle | null;
        description: string;
        members: string[];
        goalTemplate: ChannelHandle | null;
        defaultResponderId: string | null;
    };
}

export const AddChannelDialog: React.FC<AddChannelDialogProps> = ({
    open,
    onClose,
    editingChannelId,
    initialData
}) => {
    const [channelName, setChannelName] = useState<ChannelHandle|null>(null);
    const [channelNameError, setChannelNameError] = useState(false);
    const [description, setDescription] = useState('');
    const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
    const [defaultResponderId, setDefaultResponderId] = useState<string | null>(null);
    const [templates, setTemplates] = useState<GoalTemplate[]>([]);
    const ipcService = useIPCService();

    useEffect(() => {
        if (initialData) {
            // Ensure channel name starts with #
            const name = initialData.name?.startsWith('#') 
                ? initialData.name 
                : `#${initialData.name || ''}`;
            setChannelName(createChannelHandle(name));
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
    }, [initialData]);

    useEffect(() => {
        ipcService.getRPC().loadGoalTemplates().then(setTemplates);
    }, []);

    const [lastSelectedTemplateName, setLastSelectedTemplateName] = useState<string>('');
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

    const webSocket = useDataContext();

    const handleTemplateSelect = (templateId: ChannelHandle) => {
        setSelectedTemplate(templateId);
        setSelectedAgents(templates.find(t => t.id === templateId)?.supportingAgents.map(idOrHandle => 
            idOrHandle.startsWith('@') 
                ? webSocket.handles.find(h => h.handle === idOrHandle.slice(1))?.id || idOrHandle
                : idOrHandle
        ) || []);
        
        const template = templates.find(t => t.id === templateId);
        if (template?.defaultResponder) {
            setDefaultResponderId(
                template.defaultResponder.startsWith('@')
                    ? webSocket.handles.find(h => h.handle === template.defaultResponder.slice(1))?.id || template.defaultResponder
                    : template.defaultResponder
            );
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
            const params = {
                name: channelName,
                description,
                members: selectedAgents,
                goalTemplate: selectedTemplate,
                defaultResponderId: defaultResponderId || undefined
            };

            if (editingChannelId) {
                await webSocket.deleteChannel(editingChannelId);
                await webSocket.createChannel(params);
            } else {
                await webSocket.createChannel(params);
            }

            onClose();
            webSocket.fetchChannels();
        } catch (error) {
            console.error('Failed to save channel:', error);
        }
    };

    const handleDeleteChannel = async () => {
        if (editingChannelId) {
            try {
                await webSocket.deleteChannel(editingChannelId);
                webSocket.fetchChannels();
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
                                                            : webSocket.handles.find(h => h.id === idOrHandle)?.handle || 'Unknown'
                                                    )
                                                    .join(', ')}
                                            </Typography>
                                        </CardContent>
                                    </CardActionArea>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>

                    <FormControl fullWidth sx={{ mb: 2 }}>
                        <InputLabel>Add Agents</InputLabel>
                        <Select
                            multiple
                            value={selectedAgents}
                            onChange={(e) => setSelectedAgents(e.target.value as string[])}
                            renderValue={(selected) => (selected as string[])
                                .map(idOrHandle => 
                                    idOrHandle.startsWith('@') 
                                        ? idOrHandle 
                                        : webSocket.handles.find(h => h.id === idOrHandle)?.handle || 'Unknown'
                                )
                                .join(', ')}
                        >
                            {webSocket.handles.map((handle) => {
                                const isSelected = selectedAgents.includes(handle.id);
                                return (
                                    <MenuItem key={handle.id} value={handle.id}>
                                        <Checkbox checked={isSelected} />
                                        <ListItemText primary={handle.handle} />
                                    </MenuItem>
                                );
                            })}
                        </Select>
                    </FormControl>

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
                                        : webSocket.handles.find(h => h.id === agentId)?.handle || 'Unknown'}
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
