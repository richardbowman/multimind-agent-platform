import React, { useEffect, useRef, useState } from 'react';
import { useMessages } from '../contexts/MessageContext';
import {
    Box,
    Typography,
    List,
    ListItem,
    ListItemButton,
    ListItemText,
    Chip
} from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import { CustomScrollbarStyles } from '../styles/styles';
import { ScrollView } from './shared/ScrollView';

interface ThreadListProps {
    channelId: string | null;
}

export const ThreadList: React.FC<ThreadListProps> = ({ channelId }) => {
    const { messages, currentThreadId, setCurrentThreadId } = useMessages();
    const activeThreadRef = useRef<HTMLLIElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    // Get root messages that have replies
    const threadsInChannel = messages
        .filter(msg => msg.channel_id === channelId && !msg.props?.['root-id'])
        .filter(msg => messages.some(reply => reply.props?.['root-id'] === msg.id))
        .map(rootMsg => ({
            rootMessage: rootMsg,
            replies: messages.filter(msg => msg.props?.['root-id'] === rootMsg.id),
            last_message_at: Math.max(
                rootMsg.create_at,
                ...messages
                    .filter(msg => msg.props?.['root-id'] === rootMsg.id)
                    .map(msg => msg.create_at)
            )
        }))
        .sort((a, b) => b.last_message_at - a.last_message_at);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'hidden' }}>
            <Box sx={{ pt: 2, px: 2 }}>
                <Typography variant="h6">
                    Threads
                </Typography>
            </Box>
            <ScrollView sx={{ display: 'flex', flexDirection: 'column', flex: 1 }} innerSx={{ p:1, px: 2 }}>
                <List
                    ref={listRef}
                >
                    <ListItem
                        ref={currentThreadId === null ? activeThreadRef : null}
                        key="root"
                        disablePadding
                    >
                        <ListItemButton
                            selected={currentThreadId === null}
                            onClick={() => setCurrentThreadId(null)}
                            sx={{
                                mb: 1,
                                borderRadius: 1,
                                border: '1px solid',
                                borderColor: 'divider',
                                bgcolor: currentThreadId === null ? 'primary.main' : 'background.paper',
                                '&:hover': {
                                    bgcolor: currentThreadId === null ? 'primary.dark' : 'action.hover'
                                },
                                '&.Mui-selected': {
                                    bgcolor: 'primary.main',
                                    '&.Mui-selected': {
                                        '&:hover': {
                                            bgcolor: 'primary.dark'
                                        }
                                    }
                                }
                            }}
                        >
                            <ListItemText
                                primary="Main Channel"
                                secondary="Channel Root"
                                primaryTypographyProps={{
                                    color: currentThreadId === null ? '#fff' : 'text.primary',
                                    fontWeight: currentThreadId === null ? 500 : 400
                                }}
                                secondaryTypographyProps={{
                                    color: currentThreadId === null ? '#ddd' : 'text.secondary'
                                }}
                            />
                        </ListItemButton>
                    </ListItem>
                    {threadsInChannel.map(thread => (
                        <ListItem
                            ref={currentThreadId === thread.rootMessage.id ? activeThreadRef : null}
                            key={thread.rootMessage.id}
                            disablePadding
                        >
                            <ListItemButton
                                selected={currentThreadId === thread.rootMessage.id}
                                onClick={() => setCurrentThreadId(thread.rootMessage.id)}
                                sx={{
                                    mb: 1,
                                    borderRadius: 1,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    bgcolor: currentThreadId === thread.rootMessage.id ? 'primary.main' : 'background.paper',
                                    '&:hover': {
                                        bgcolor: currentThreadId === thread.rootMessage.id ? 'primary.dark' : 'action.hover'
                                    },
                                    '&.Mui-selected': {
                                        bgcolor: 'primary.main',
                                        '&.Mui-selected': {
                                            '&:hover': {
                                                bgcolor: 'primary.dark'
                                            }
                                        }
                                    }
                                }}
                            >
                                <ListItemText
                                    primary={thread.rootMessage.message.substring(0, 50) +
                                        (thread.rootMessage.message.length > 50 ? '...' : '')}
                                    secondary={
                                        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                                            <ChatBubbleOutlineIcon fontSize="small" />
                                            <span style={{ marginRight: 8 }}>
                                                {thread.replies.length} replies
                                            </span>
                                            <span>
                                                {new Date(thread.last_message_at).toLocaleString()}
                                            </span>
                                        </span>
                                    }
                                    primaryTypographyProps={{
                                        color: currentThreadId === thread.rootMessage.id ? '#fff' : 'text.primary',
                                        fontWeight: currentThreadId === thread.rootMessage.id ? 500 : 400
                                    }}
                                />
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            </ScrollView>
        </Box>
    );
};
