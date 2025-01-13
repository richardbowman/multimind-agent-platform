import React, { useEffect, useRef, useState } from 'react';
import { Box, Typography, List, ListItem, ListItemText, Paper } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { CommandInput } from './CommandInput';
import { Spinner } from './Spinner';
import { useWebSocket } from '../contexts/DataContext';
import remarkGfm from 'remark-gfm'
import Link from '@mui/material/Link';

// Custom link component that opens links in system browser
const CustomLink = ({ href, children }: { href?: string, children: React.ReactNode }) => {
    const handleClick = (e: React.MouseEvent) => {
        e.preventDefault();
        if (href) {
            window.open(href, '_blank');
        }
    };

    return (
        <Link href={href} onClick={handleClick} sx={{ color: 'primary.main' }}>
            {children}
        </Link>
    );
};

interface ChatPanelProps {
    leftDrawerOpen: boolean;
    rightDrawerOpen: boolean;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ leftDrawerOpen, rightDrawerOpen }) => {
    const { messages, sendMessage, handles, currentChannelId, currentThreadId, setCurrentThreadId, isLoading, tasks } = useWebSocket();
    const [userId] = useState('test');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const [isAtBottom, setIsAtBottom] = useState(true);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    const checkScrollPosition = () => {
        if (messagesContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
            setIsAtBottom(scrollHeight - (scrollTop + clientHeight) < 50);
        }
    };

    const scrollToBottom = () => {
        if (isAtBottom && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    };

    // Handle scrolling
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (container) {
            container.addEventListener('scroll', checkScrollPosition);
            return () => container.removeEventListener('scroll', checkScrollPosition);
        }
    }, []);

    // Scroll to bottom when new messages come in for current thread/channel
    useEffect(() => {
        const relevantMessages = messages.filter(message => 
            message.channel_id === currentChannelId &&
            (currentThreadId 
                ? message.id === currentThreadId || message.props?.['root-id'] === currentThreadId
                : !message.props?.['root-id'])
        );

        if (relevantMessages.length > 0) {
            scrollToBottom();
        }
    }, [messages.length, currentChannelId, currentThreadId]);

    // Scroll to bottom when in-progress messages update in current thread
    useEffect(() => {
        const hasRelevantInProgress = messages.some(m => 
            m.inProgress &&
            m.channel_id === currentChannelId &&
            (currentThreadId 
                ? m.id === currentThreadId || m.props?.['root-id'] === currentThreadId
                : !m.props?.['root-id'])
        );

        if (hasRelevantInProgress) {
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
            height: 'calc(100vh - 64px)',
            width: `calc(100vw - ${leftDrawerOpen ? 250 : 0}px - ${rightDrawerOpen ? 300 : 0}px)`,
            overflow: 'hidden',
            ml: '250px',
            mr: rightDrawerOpen ? '300px' : 0,
            transition: 'all 225ms cubic-bezier(0, 0, 0.2, 1) 0ms'
        }}>
            <Box 
                ref={messagesContainerRef}
                sx={{ 
                    flex: 1,
                    overflowY: 'auto',
                    p: 2,
                    bgcolor: 'background.paper',
                    width: '100%'
                }}
                onScroll={checkScrollPosition}
            >
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
                                <ReactMarkdown 
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        a: CustomLink
                                    }}
                                >
                                    {message.message}
                                </ReactMarkdown>
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
                                            View thread ({message.reply_count} {message.reply_count === 1 ? 'response' : 'responses'})
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        </Paper>
                    )))}
                {tasks.filter(task => task.inProgress && !task.complete && (task.threadId === currentThreadId)).length > 0 && (
                    <Paper 
                        elevation={0}
                        sx={{ 
                            mt: 2,
                            p: 2,
                            bgcolor: 'background.paper',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 2
                        }}
                    >
                        <Typography 
                            variant="overline" 
                            sx={{ 
                                mb: 1,
                                color: 'text.secondary',
                                display: 'block'
                            }}
                        >
                            In Progress Tasks
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {tasks
                                .filter(task => task.inProgress && !task.complete && (task.threadId === currentThreadId))
                                .map(task => (
                                    <Paper 
                                        key={task.id}
                                        elevation={0}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 1,
                                            p: 1,
                                            bgcolor: 'background.default',
                                            borderRadius: 1,
                                            border: '1px solid',
                                            borderColor: 'divider'
                                        }}
                                    >
                                        <Spinner />
                                        <Typography variant="body2" sx={{ color: 'text.primary' }}>
                                            {task.description}
                                        </Typography>
                                    </Paper>
                                ))
                            }
                        </Box>
                    </Paper>
                )}
                <div ref={messagesEndRef} />
            </Box>
            <CommandInput onSendMessage={handleSendMessage} currentChannel={currentChannelId}/>
        </Box>
    );
};
