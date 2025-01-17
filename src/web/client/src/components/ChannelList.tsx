import React, { useState } from 'react';
import { Channel } from '../../../../types/types';
import { useWebSocket } from '../contexts/DataContext';
import { 
    Button, 
    Dialog, 
    DialogActions, 
    DialogContent, 
    DialogTitle, 
    TextField, 
    IconButton, 
    FormControl, 
    InputLabel, 
    Select, 
    MenuItem, 
    Checkbox, 
    ListItemText, 
    List, 
    ListItem, 
    ListItemButton, 
    Typography, 
    Box,
    FormControlLabel,
    Stack,
    Grid,
    Card,
    CardContent,
    CardActionArea
} from '@mui/material';
import { GoalTemplates } from '../../../../schemas/goalTemplateSchema';
import AddIcon from '@mui/icons-material/Add';

interface ChannelListProps {}

export const ChannelList: React.FC<ChannelListProps> = () => {
    const { channels, currentChannelId, setCurrentChannelId } = useWebSocket();
    const [open, setOpen] = useState(false);
    const [channelName, setChannelName] = useState('');
    const [channelNameError, setChannelNameError] = useState(false);
    const [description, setDescription] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
    const [defaultResponderId, setDefaultResponderId] = useState<string | null>(null);

    const webSocket = useWebSocket();

    const handleCreateChannel = async () => {
        if (!channelName.trim()) {
            setChannelNameError(true);
            return;
        }
        
        try {
            await webSocket.createChannel({
                name: channelName,
                description,
                isPrivate,
                members: selectedAgents,
                goalTemplate: selectedTemplate,
                defaultResponderId: defaultResponderId || undefined
            });
            setOpen(false);
            setChannelName('');
            setDescription('');
            setIsPrivate(false);
            webSocket.fetchChannels(); // Refresh channel list
        } catch (error) {
            console.error('Failed to create channel:', error);
        }
    };

    return (
        <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ color: '#fff' }}>
                    Channels ({channels.length})
                </Typography>
                <IconButton 
                    color="primary"
                    onClick={() => setOpen(true)}
                    sx={{ 
                        backgroundColor: 'primary.main',
                        color: 'white',
                        '&:hover': {
                            backgroundColor: 'primary.dark'
                        }
                    }}
                >
                    <AddIcon />
                </IconButton>
            </Stack>

            {channels.length === 0 && (
                <Typography variant="body1" sx={{ color: '#666', textAlign: 'center' }}>
                    Loading channels...
                </Typography>
            )}

            <List>
                {channels.map(channel => (
                    <ListItem 
                        key={channel.id}
                        disablePadding
                    >
                        <ListItemButton
                            selected={currentChannelId === channel.id}
                            onClick={() => {
                                setCurrentChannelId(channel.id);
                                webSocket.setCurrentThreadId(null); // Reset thread when switching channels
                            }}
                            sx={{
                                mb: 1,
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: currentChannelId === channel.id ? 'primary.main' : 'background.paper',
                                '&:hover': {
                                    bgcolor: currentChannelId === channel.id ? 'primary.dark' : 'action.hover'
                                }
                            }}
                        >
                            <Typography 
                                variant="body1" 
                                sx={{ 
                                    color: currentChannelId === channel.id ? '#fff' : 'text.primary',
                                    fontWeight: currentChannelId === channel.id ? 500 : 400
                                }}
                            >
                                # {channel.name}
                            </Typography>
                        </ListItemButton>
                    </ListItem>
                ))}
            </List>

            <Dialog open={open} onClose={() => setOpen(false)}>
                <DialogTitle>Create New Channel</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Channel Name"
                        fullWidth
                        value={channelName}
                        onChange={(e) => {
                            setChannelName(e.target.value);
                            setChannelNameError(false);
                        }}
                        error={channelNameError}
                        helperText={channelNameError ? "Channel name is required" : ""}
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
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={isPrivate}
                                onChange={(e) => setIsPrivate(e.target.checked)}
                            />
                        }
                        label="Private Channel"
                        sx={{ mb: 2 }}
                    />
                    <Typography variant="h6" sx={{ mb: 2 }}>Select Goal Template</Typography>
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        {GoalTemplates.map(template => (
                            <Grid item xs={6} key={template.id}>
                                <Card 
                                    variant={selectedTemplate === template.id ? 'elevation' : 'outlined'}
                                    sx={{
                                        borderColor: selectedTemplate === template.id ? 'primary.main' : 'divider',
                                        height: '100%'
                                    }}
                                >
                                    <CardActionArea 
                                        onClick={() => {
                                            setSelectedTemplate(template.id);
                                            // Convert @handles to IDs when selecting template
                                            setSelectedAgents(template.supportingAgents.map(idOrHandle => 
                                                idOrHandle.startsWith('@') 
                                                    ? webSocket.handles.find(h => h.handle === idOrHandle.slice(1))?.id || idOrHandle
                                                    : idOrHandle
                                            ));
                                        }}
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
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button 
                        onClick={handleCreateChannel} 
                        color="primary"
                        disabled={!channelName.trim()}
                    >
                        Create
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
