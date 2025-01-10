import React, { useState } from 'react';
import { Channel } from '../../../../types/types';
import { useWebSocket } from '../contexts/DataContext';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material';

interface ChannelListProps {}

export const ChannelList: React.FC<ChannelListProps> = () => {
    const { channels, currentChannelId, setCurrentChannelId } = useWebSocket();
    const [open, setOpen] = useState(false);
    const [channelName, setChannelName] = useState('');
    const [description, setDescription] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);

    const handleCreateChannel = async () => {
        try {
            await useWebSocket().sendMessage({
                type: 'create_channel',
                channelName,
                description,
                isPrivate
            });
            setOpen(false);
            setChannelName('');
            setDescription('');
            setIsPrivate(false);
        } catch (error) {
            console.error('Failed to create channel:', error);
        }
    };

    return (
        <div className="channel-list">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Channels ({channels.length})</h2>
                <Button 
                    variant="contained" 
                    color="primary"
                    onClick={() => setOpen(true)}
                >
                    Add Channel
                </Button>
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
