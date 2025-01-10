import React, { useState } from 'react';
import { Channel } from '../../../../types/types';
import { useWebSocket } from '../contexts/DataContext';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, IconButton, FormControl, InputLabel, Select, MenuItem, Checkbox, ListItemText } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

interface ChannelListProps {}

export const ChannelList: React.FC<ChannelListProps> = () => {
    const { channels, currentChannelId, setCurrentChannelId } = useWebSocket();
    const [open, setOpen] = useState(false);
    const [channelName, setChannelName] = useState('');
    const [description, setDescription] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

    const webSocket = useWebSocket();

    const handleCreateChannel = async () => {
        try {
            await webSocket.createChannel({
                name: channelName,
                description,
                isPrivate,
                members: selectedAgents
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
        <div className="channel-list">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Channels ({channels.length})</h2>
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
            </div>
            {channels.length === 0 && <div>Loading channels...</div>}
            <Dialog open={open} onClose={() => setOpen(false)}>
                <DialogTitle>Create New Channel</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Channel Name"
                        fullWidth
                        value={channelName}
                        onChange={(e) => setChannelName(e.target.value)}
                    />
                    <TextField
                        margin="dense"
                        label="Description"
                        fullWidth
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                    <div style={{ marginTop: '1rem' }}>
                        <label>
                            <input
                                type="checkbox"
                                checked={isPrivate}
                                onChange={(e) => setIsPrivate(e.target.checked)}
                            />
                            Private Channel
                        </label>
                    </div>
                    <FormControl fullWidth sx={{ mt: 2 }}>
                        <InputLabel>Add Agents</InputLabel>
                        <Select
                            multiple
                            value={selectedAgents}
                            onChange={(e) => setSelectedAgents(e.target.value as string[])}
                            renderValue={(selected) => (selected as string[]).join(', ')}
                        >
                            {webSocket.handles.map((handle) => (
                                <MenuItem key={handle.id} value={handle.id}>
                                    <Checkbox checked={selectedAgents.indexOf(handle.id) > -1} />
                                    <ListItemText primary={handle.handle} />
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateChannel} color="primary">
                        Create
                    </Button>
                </DialogActions>
            </Dialog>
            <ul>
                {channels.map(channel => (
                    <li
                        key={channel.id}
                        className={`channel-item ${currentChannelId === channel.id ? 'active' : ''}`}
                        onClick={() => setCurrentChannelId(channel.id)}
                    >
                        # {channel.name}
                    </li>
                ))}
            </ul>
        </div>
    );
};
