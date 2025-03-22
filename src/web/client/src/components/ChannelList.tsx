import React, { useState, useMemo } from 'react';
import { Channel } from '../../../../types/types';
import { useChannels } from '../contexts/ChannelContext';
import { 
    IconButton, 
    List, 
    ListItem, 
    ListItemButton, 
    Typography, 
    Box,
    Stack
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import { AddChannelDialog } from './AddChannelDialog';
import { createChannelHandle } from '../../../../shared/channelTypes';
import { useMessages } from '../contexts/MessageContext';
import { ScrollView } from './shared/ScrollView';

interface ChannelListProps {}

export const ChannelList: React.FC<ChannelListProps> = () => {
    const { channels } = useChannels();
    const { currentChannelId, setCurrentChannelId, currentThreadId, setCurrentThreadId } = useMessages();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingChannelId, setEditingChannelId] = useState<string | null>(null);

    const handleOpenDialog = (channelId: string | null = null) => {
        setEditingChannelId(channelId);
        setDialogOpen(true);
    };

    return (
        <Box sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', overflowY: 'hidden' }}>
            <Box sx={{ mb: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Typography variant="h6">
                        Channels ({channels.length})
                    </Typography>
                    <IconButton 
                        color="primary"
                        onClick={() => handleOpenDialog()}
                    >
                        <AddIcon />
                    </IconButton>
                </Stack>
            </Box>

            <ScrollView>
                {channels.length === 0 && (
                    <Typography variant="body1" sx={{ color: '#666', textAlign: 'center', mt: 2 }}>
                        Loading channels...
                    </Typography>
                )}

                <List sx={{ display: 'flex', flexDirection: 'column' }}>
                {channels.map(channel => (
                    <ListItem 
                        key={channel.id}
                        disablePadding
                    >
                        <ListItemButton
                            selected={currentChannelId === channel.id}
                            onClick={() => {
                                setCurrentChannelId(channel.id);
                                setCurrentThreadId(null); // Reset thread when switching channels
                            }}
                            sx={{
                                mb: 1,
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: currentChannelId === channel.id ? 'primary.main' : 'background.paper',
                                '&:hover': {
                                    bgcolor: currentChannelId === channel.id ? 'primary.dark' : 'action.hover'
                                },
                                '&.Mui-selected': {
                                    bgcolor: 'primary.main',
                                    '&:hover': {
                                        bgcolor: 'primary.dark'
                                    }
                                }
                            }}
                        >
                            <Box sx={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                width: '100%',
                                justifyContent: 'space-between'
                            }}>
                                <Typography 
                                    variant="body1" 
                                    sx={{ 
                                        color: currentChannelId === channel.id ? 'common.white' : 'text.primary',
                                        fontWeight: currentChannelId === channel.id ? 500 : 400,
                                    }}
                                >
                                    {channel.name}
                                </Typography>
                                <Box sx={{ 
                                    opacity: 0,
                                    transition: 'opacity 0.2s',
                                    '&:hover': {
                                        opacity: 1
                                    },
                                    '.MuiListItemButton:hover &': {
                                        opacity: 1
                                    }
                                }}>
                                    <IconButton 
                                        size="small"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenDialog(channel.id);
                                        }}
                                        sx={{
                                            color: currentChannelId === channel.id ? 'common.white' : 'text.primary',
                                            '&:hover': {
                                                backgroundColor: 'rgba(255, 255, 255, 0.1)'
                                            }
                                        }}
                                    >
                                        <EditIcon fontSize="small" />
                                    </IconButton>
                                </Box>
                            </Box>
                        </ListItemButton>
                    </ListItem>
                ))}
                </List>
            </ScrollView>

            <AddChannelDialog
                open={dialogOpen}
                onClose={() => {
                    setDialogOpen(false);
                    setEditingChannelId(null);
                }}
                editingChannelId={editingChannelId}
                initialData={editingChannelId ? {
                    name: channels.find(c => c.id === editingChannelId)?.name || null,
                    description: channels.find(c => c.id === editingChannelId)?.description || '',
                    members: channels.find(c => c.id === editingChannelId)?.members || [],
                    goalTemplate: channels.find(c => c.id === editingChannelId)?.goalTemplate || null,
                    defaultResponderId: channels.find(c => c.id === editingChannelId)?.defaultResponderId || null
                } : undefined}
                existingChannelNames={useMemo(() => 
                    channels
                        .filter(c => c.id !== editingChannelId) // Exclude current channel when editing
                        .map(c => c.name.toLowerCase()), 
                    [channels, editingChannelId]
                )}
            />
        </Box>
    );
};
