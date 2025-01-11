import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, List, ListItem, ListItemText, Paper } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { CommandInput } from './CommandInput';
import { Spinner } from './Spinner';
import { useWebSocket } from '../contexts/DataContext';
import remarkGfm from 'remark-gfm'

interface ChatPanelProps {}

export const ChatPanel: React.FC<ChatPanelProps> = () => {
    const { messages, sendMessage, handles, currentChannelId, currentThreadId, setCurrentThreadId, isLoading, tasks } = useWebSocket();
    const [userId] = useState('test');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    // Handle scrolling
    useEffect(() => {
        if (messages.length > 0) {
            scrollToBottom();
        }
    }, [messages.length]);

    // Scroll to bottom when messages are updated or when a message's inProgress status changes
    useEffect(() => {
        if (messages.some(m => m.inProgress)) {
            scrollToBottom();
        }
    }, [messages]);

    const [lastMessage, setLastMessage] = useState<string | null>(null);

    const handleSendMessage = async (content: string) => {
        if (!currentChannelId) return;

        // Handle special commands
        if (content.startsWith('/')) {
            const [command, ...args] = content.split(' ');
            
            switch (command) {
                case '/retry':
                    if (lastMessage) {
                        sendMessage({
                            channel_id: currentChannelId,
                            thread_id: currentThreadId || undefined,
                            message: lastMessage,
                            user_id: userId,
                            create_at: Date.now(),
                            props: {}
                        });
                    }
                    return;
                    
                case '/channel':
                    // Send message to channel root regardless of current thread
                    const channelMessage = args.join(' ');
                    if (channelMessage) {
                        sendMessage({
                            channel_id: currentChannelId,
                            message: channelMessage,
                            user_id: userId,
                            create_at: Date.now(),
                            props: {}
                        });
                    }
                    return;

                default:
                    // If not a special command, send as regular message
                    break;
            }
        }

        // Store non-command messages for /retry
        if (!content.startsWith('/')) {
            setLastMessage(content);
        }

        const message = {
            channel_id: currentChannelId,
            message: content,
            user_id: userId,
            create_at: Date.now(),
            thread_id: currentThreadId || undefined,
            props: currentThreadId ? { 'root-id': currentThreadId } : {}
        };
        
        sendMessage(message);
    };

    return (
        <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflow: 'hidden'
        }}>
            <Box sx={{ 
                flex: 1,
                overflowY: 'auto',
                p: 2,
                bgcolor: 'background.paper'
            }}>
                {isLoading ? (
                    <Typography variant="body1" sx={{ 
                        textAlign: 'center',
                        color: 'text.secondary',
                        fontStyle: 'italic',
                        p: 2
                    }}>
                        Loading messages...
                    </Typography>
                ) : messages.length === 0 ? (
                    <Typography variant="body1" sx={{ 
                        textAlign: 'center',
                        color: 'text.secondary',
                        fontStyle: 'italic',
                        p: 2
                    }}>
                        No messages yet
                    </Typography>
                ) : (
                (messages||[])
                    .filter(message => message.channel_id === currentChannelId)
                    .filter(message => {
                        if (currentThreadId) {
                            return message.id === currentThreadId || 
                                   message.props?.['root-id'] === currentThreadId;
                        } else {
                            return !message.props?.['root-id'];
                        }
                    })
                    .map((message) => (
                        <Paper key={message.id} sx={{ 
                            mb: 2,
                            p: 2,
                            bgcolor: 'background.default'
                        }}>
                            <Box sx={{ 
                                display: 'flex',
                                justifyContent: 'space-between',
                                mb: 1
                            }}>
                                <Typography variant="subtitle2" sx={{ color: 'primary.main' }}>
                                    {handles.find(h => h.id === message.user_id)?.handle || 'Unknown User'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    {new Date(message.create_at).toLocaleString()}
                                </Typography>
                            </Box>
                            <Box>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.message}</ReactMarkdown>
                                {message.inProgress && <Spinner />}
                                {!currentThreadId && messages.some(m => m.props?.['root-id'] === message.id) && (
                                    <Box
                                        onClick={() => setCurrentThreadId(message.id)}
                                        sx={{
                                            mt: 1,
                                            p: 1,
                                            bgcolor: 'action.hover',
                                            borderRadius: 1,
                                            cursor: 'pointer',
                                            '&:hover': {
                                                bgcolor: 'action.selected'
                                            }
                                        }}
                                    >
                                        <Typography variant="caption" sx={{ color: 'primary.main' }}>
                                            View thread ({message.reply_count} responses)
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Paper>
                    )))}
                {tasks.filter(task => task.inProgress && !task.complete && (task.threadId === currentThreadId)).length > 0 && (
                    <Paper sx={{ 
                        mt: 2,
                        p: 2,
                        bgcolor: 'background.default'
                    }}>
                        <Typography variant="subtitle2" sx={{ 
                            mb: 1,
                            color: 'text.secondary',
                            textTransform: 'uppercase'
                        }}>
                            In Progress Tasks
                        </Typography>
                        <List>
                            {tasks
                                .filter(task => task.inProgress && !task.complete && (task.threadId === currentThreadId))
                                .map(task => (
                                    <ListItem key={task.id} sx={{ 
                                        p: 1,
                                        bgcolor: 'background.paper',
                                        borderRadius: 1,
                                        mb: 1
                                    }}>
                                        <Spinner />
                                        <ListItemText 
                                            primary={task.description}
                                            sx={{ ml: 1 }}
                                        />
                                    </ListItem>
                                ))
                            }
                        </List>
                    </Paper>
                )}
                <div ref={messagesEndRef} />
            </Box>
            <CommandInput onSendMessage={handleSendMessage} />
        </Box>
    );
};
