import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
    Box,
    Typography,
    List,
    ListItem, Paper,
    Dialog,
    DialogTitle,
    DialogContent,
    Stack,
    Button,
    ListItemButton
} from '@mui/material';
import ReactMarkdown from 'react-markdown';
import { CommandInput } from './CommandInput';
import { Spinner } from './Spinner';
import { useDataContext } from '../contexts/DataContext';
import { useIPCService } from '../contexts/IPCContext';
import remarkGfm from 'remark-gfm';
import Link from '@mui/material/Link';
import { TaskDialog } from './TaskDialog';
import { ClientProject } from '../../../../shared/types';
import { CodeBlock } from './shared/CodeBlock';
import { GoalTemplates } from '../../../../schemas/goalTemplateSchema';

// Custom link component that opens links in system browser
export const CustomLink = ({ href, children }: { href?: string, children: React.ReactNode }) => {
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
    const { messages, sendMessage, handles, currentChannelId, currentThreadId, setCurrentThreadId, isLoading, tasks } = useDataContext();
    const [selectedMessage, setSelectedMessage] = useState<any>(null);
    const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

    // Automatically expand the last 2 messages
    const visibleMessages = useMemo(() => {
        const filtered = messages
            .filter(message => message.channel_id === currentChannelId)
            .filter(message => {
                if (currentThreadId) {
                    return message.id === currentThreadId ||
                        message.props?.['root-id'] === currentThreadId;
                } else {
                    return !message.props?.['root-id'];
                }
            });

        // Always expand the last 2 messages
        const lastTwoIds = filtered.slice(-2).map(m => m.id);
        setExpandedMessages(prev => new Set([...prev, ...lastTwoIds]));

        return filtered;
    }, [messages, currentChannelId, currentThreadId]);

    const toggleMessageExpansion = useCallback((messageId: string) => {
        setExpandedMessages(prev => {
            const newSet = new Set(prev);
            if (newSet.has(messageId)) {
                newSet.delete(messageId);
            } else {
                newSet.add(messageId);
            }
            return newSet;
        });
    }, []);
    const [metadataDialogOpen, setMetadataDialogOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<any>(null);
    const [taskDialogOpen, setTaskDialogOpen] = useState(false);
    const [userId] = useState('test');
    const [currentProject, setCurrentProject] = useState<ClientProject | null>(null);
    const ipcService = useIPCService();
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { channels } = useDataContext();

    const [isAtBottom, setIsAtBottom] = useState(true);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    const checkScrollPosition = useCallback(() => {
        if (messagesContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
            const newIsAtBottom = scrollHeight - (scrollTop + clientHeight) < 50;
            console.debug('Setting isAtBottom:', newIsAtBottom, isAtBottom);
            setIsAtBottom(newIsAtBottom);
        }
    }, []);

    const scrollToBottom = useCallback(() => {
        if (isAtBottom && messagesEndRef.current) {
            console.debug('scrollToBottom activated');
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 500);
        }
    }, [isAtBottom, messagesEndRef]);

    const fetchProject = useCallback(async (projectId: string) => {
        try {
            const project = await ipcService.getRPC().getProject(projectId);
            setCurrentProject(project);
        } catch (error) {
            console.error('Failed to fetch project:', error);
            setCurrentProject(null);
        }
    }, [ipcService]);

    useEffect(() => {
        // Get project ID from channel metadata
        const channel = channels.find(c => c.id === currentChannelId);
        if (channel?.projectId) {
            fetchProject(channel.projectId);
        } else {
            setCurrentProject(null);
        }
    }, [currentChannelId, channels, fetchProject]);

    // Handle scrolling
    useEffect(() => {
        const container = messagesContainerRef.current;
        if (container) {
            const scrollHandler = () => {
                console.debug('Scroll event detected');
                requestAnimationFrame(checkScrollPosition);
            };
            container.addEventListener('scroll', scrollHandler);
            return () => {
                console.debug('Removing scroll listener');
                container.removeEventListener('scroll', scrollHandler);
            };
        }
    }, [checkScrollPosition]);

    // Scroll to bottom when new messages come in for current thread/channel
    useEffect(() => {
        const relevantMessages = messages.filter(message =>
            message.channel_id === currentChannelId &&
            (currentThreadId
                ? message.id === currentThreadId || message.props?.['root-id'] === currentThreadId
                : !message.props?.['root-id'])
        );

        console.debug('Messages changed - relevant messages:', relevantMessages.length);
        console.debug('isAtBottom:', isAtBottom);

        if (relevantMessages.length > 0) {
            if (isAtBottom) {
                console.debug('Scrolling to bottom');
                scrollToBottom();
            } else {
                console.debug('Not scrolling - user is not at bottom');
            }
        }
    }, [messages.length]);

    // Scroll to bottom when new messages come in for current thread/channel
    useEffect(() => {
        const relevantMessages = messages.filter(message =>
            message.channel_id === currentChannelId &&
            (currentThreadId
                ? message.id === currentThreadId || message.props?.['root-id'] === currentThreadId
                : !message.props?.['root-id'])
        );

        console.debug('Messages changed - relevant messages:', relevantMessages.length);
        console.debug('isAtBottom:', isAtBottom);

        if (relevantMessages.length > 0) {
            console.debug('Scrolling to bottom');
            setIsAtBottom(true);
        }
    }, [currentChannelId, currentThreadId]);    

    // Scroll to bottom when in-progress messages update in current thread
    useEffect(() => {
        const hasRelevantInProgress = messages.some(m =>
            m.inProgress &&
            m.channel_id === currentChannelId &&
            (currentThreadId
                ? m.id === currentThreadId || m.props?.['root-id'] === currentThreadId
                : !m.props?.['root-id'])
        );

        console.debug('Checking in-progress messages:', hasRelevantInProgress);
        console.debug('isAtBottom:', isAtBottom);

        if (hasRelevantInProgress) {
            if (isAtBottom) {
                console.debug('Scrolling to bottom for in-progress message');
                // scrollToBottom();
            } else {
                console.debug('Not scrolling - user is not at bottom');
            }
        }
    }, [messages]);

    const [lastMessage, setLastMessage] = useState<string | null>(null);

    const handleSendMessage = async (content: string, artifactIds?: string) => {
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
                            props: {
                                ["artifact-ids"]: artifactIds
                            }
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
                            props: {
                                ["artifact-ids"]: artifactIds
                            }
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
            props: {
                ["artifact-ids"]: artifactIds,
                ...(currentThreadId ? { 'root-id': currentThreadId } : {})
            }
        };

        sendMessage(message);
    };

    const uniqueTasks = Array.from(new Map((tasks || []).map(task => [task.id, task])).values()).filter(t => t.inProgress);

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
                {/* Project Overview Card - Only show when not in thread view */}
                {currentProject && !currentThreadId && (
                    <Paper
                        elevation={0}
                        sx={{
                            mb: 2,
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
                            Project Overview
                        </Typography>
                        <Box>
                            <Typography variant="h6" sx={{ mb: 1 }}>
                                {currentProject.name}
                            </Typography>
                            <Typography variant="body2" sx={{ mb: 2 }}>
                                {currentProject.metadata.description}
                            </Typography>

                            <Box sx={{ mt: 2 }}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                    Tasks:
                                </Typography>
                                <List dense sx={{ mb: 2 }}>
                                    {currentProject.tasks.map(task => (
                                        <ListItem key={task.id} sx={{ p: 0 }}>
                                            <ListItemButton
                                                onClick={() => {
                                                    setSelectedTask(task);
                                                    setTaskDialogOpen(true);
                                                }}
                                            >
                                                <Typography variant="body2">
                                                    {task.description}
                                                </Typography>
                                                {task.complete && (
                                                    <Typography variant="caption" sx={{ ml: 1, color: 'success.main' }}>
                                                        ✓
                                                    </Typography>
                                                )}
                                                {task.inProgress && (
                                                    <Typography variant="caption" sx={{ ml: 1, color: 'warning.main' }}>
                                                        ⌛
                                                    </Typography>
                                                )}
                                            </ListItemButton>
                                        </ListItem>
                                    ))}
                                </List>
                            </Box>

                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                Status: {currentProject.metadata.status} |
                                Created: {new Date(currentProject.metadata.createdAt).toLocaleDateString()} |
                                Last Updated: {new Date(currentProject.metadata.updatedAt).toLocaleDateString()}
                            </Typography>
                        </Box>
                    </Paper>
                )}

                {/* Goal Planning Card */}
                {!currentProject && channels.find(c => c.id === currentChannelId)?.goalTemplate && (
                    <Paper
                        elevation={0}
                        sx={{
                            mb: 2,
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
                            Project Planning
                        </Typography>
                        {(() => {
                            const template = GoalTemplates.find(
                                t => t.id === channels.find(c => c.id === currentChannelId)?.goalTemplate
                            );
                            const projectId = channels.find(c => c.id === currentChannelId)?.projectId;
                            const planningTasks = tasks.filter(t =>
                                t.projectId === projectId &&
                                t.type === 'planning'
                            );

                            return template ? (
                                <Box>
                                    <Typography variant="h6" sx={{ mb: 1 }}>
                                        {template.name}
                                    </Typography>
                                    <Typography variant="body2" sx={{ mb: 2 }}>
                                        {template.description}
                                    </Typography>

                                    {planningTasks.length > 0 ? (
                                        <Box sx={{ mt: 2 }}>
                                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                                Planning Tasks:
                                            </Typography>
                                            <List dense sx={{ mb: 2 }}>
                                                {planningTasks.map(task => (
                                                    <ListItem key={task.id} sx={{ p: 0 }}>
                                                        <ListItemButton
                                                            onClick={() => {
                                                                setSelectedTask(task);
                                                                setTaskDialogOpen(true);
                                                            }}
                                                        >
                                                            <Typography variant="body2">
                                                                {task.description}
                                                            </Typography>
                                                        </ListItemButton>
                                                    </ListItem>
                                                ))}
                                            </List>
                                        </Box>
                                    ) : (
                                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                            No planning tasks created yet
                                        </Typography>
                                    )}

                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        Supporting Agents: {template.supportingAgents
                                            .map(id => handles.find(h => h.id === id)?.handle || 'Unknown')
                                            .join(', ')}
                                    </Typography>
                                </Box>
                            ) : null;
                        })()}
                    </Paper>
                )}

                {isLoading ? (
                    <Typography variant="body1" sx={{
                        textAlign: 'center',
                        color: 'text.secondary',
                        fontStyle: 'italic',
                        p: 2
                    }}>
                        Loading messages...
                    </Typography>
                ) : visibleMessages.length === 0 ? (
                    <Typography variant="body1" sx={{
                        textAlign: 'center',
                        color: 'text.secondary',
                        fontStyle: 'italic',
                        p: 2
                    }}>
                        No messages yet
                    </Typography>
                ) : (
                    visibleMessages.map((message, index) => (
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
                                <Typography
                                    variant="caption"
                                    sx={{
                                        color: 'text.secondary',
                                        cursor: 'pointer',
                                        '&:hover': {
                                            textDecoration: 'underline'
                                        }
                                    }}
                                    onClick={() => {
                                        setSelectedMessage(message);
                                        setMetadataDialogOpen(true);
                                    }}
                                >
                                    {new Date(message.create_at).toLocaleString()}
                                </Typography>
                            </Box>
                            <Box sx={{
                                position: 'relative',
                                overflow: 'hidden',
                                maxHeight: expandedMessages.has(message.id) ? 'none' : '4.5em'
                            }}>
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        a: CustomLink,
                                        code({node, inline, className, children, ...props}) {
                                            const match = /language-(\w+)(?:\s*\[hidden\])?/.exec(className || '');
                                            const content = String(children).replace(/\n$/, '');
                                            const isHidden = className?.includes('[hidden]');
                                            
                                            // Handle code blocks
                                            if (!inline && match) {
                                                return isHidden ? null : (
                                                    <CodeBlock 
                                                        language={match[1]} 
                                                        content={content}
                                                    />
                                                );
                                            }

                                            // Inline code
                                            return isHidden ? null : (
                                                <code className={className} {...props}>
                                                    {children}
                                                </code>
                                            );
                                        }
                                    }}
                                >
                                    {message.message}
                                </ReactMarkdown>
                            </Box>
                            <Box sx={{
                                position: 'relative',
                                margin: '-16px',
                                padding: '16px',
                                background: !expandedMessages.has(message.id) ? 'linear-gradient(to bottom, rgba(42,42,42,0) 0%, rgba(24,24,24,1) 100%)' : undefined,
                                borderRadius: 2
                            }}>
                                {!expandedMessages.has(message.id) && (
                                    <Box sx={{ 
                                        position: 'absolute', 
                                        bottom: 0, 
                                        right: 0,
                                        zIndex: 1,
                                        p: 1,
                                        bgcolor: 'background.paper',
                                        borderRadius: '4px 0 4px 0'
                                    }}>
                                        <Button
                                            size="small"
                                            onClick={() => toggleMessageExpansion(message.id)}
                                            sx={{
                                                textTransform: 'none',
                                                color: 'primary.main',
                                                '&:hover': {
                                                    backgroundColor: 'background.default'
                                                }
                                            }}
                                        >
                                            Show more
                                        </Button>
                                    </Box>
                                )}
                                {expandedMessages.has(message.id) && message.message.split('\n').length > 3 && (
                                    <Box sx={{ 
                                        position: 'absolute', 
                                        bottom: 0, 
                                        right: 0,
                                        zIndex: 1,
                                        p: 1,
                                        bgcolor: 'background.paper',
                                        borderRadius: '4px 0 4px 0'
                                    }}>
                                        <Button
                                            size="small"
                                            onClick={() => toggleMessageExpansion(message.id)}
                                            sx={{
                                                textTransform: 'none',
                                                color: 'primary.main',
                                                '&:hover': {
                                                    backgroundColor: 'background.default'
                                                }
                                            }}
                                        >
                                            Show less
                                        </Button>
                                    </Box>
                                )}
                                {message.inProgress && <Spinner />}
                                {expandedMessages.has(message.id) && !currentThreadId && messages.some(m => m.props?.['root-id'] === message.id) && (
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
                {uniqueTasks && uniqueTasks.length > 0 && (
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
                            {uniqueTasks.map(task => (
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
            <CommandInput onSendMessage={handleSendMessage} currentChannel={currentChannelId} />

            <Dialog
                open={metadataDialogOpen}
                onClose={() => setMetadataDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Message Metadata</DialogTitle>
                <DialogContent>
                    {selectedMessage && (
                        <Stack spacing={2} sx={{ mt: 2 }}>
                            <Typography variant="body1">
                                <strong>ID:</strong> {selectedMessage.id}
                            </Typography>
                            <Typography variant="body1">
                                <strong>Channel ID:</strong> {selectedMessage.channel_id}
                            </Typography>
                            <Typography variant="body1">
                                <strong>Thread ID:</strong> {selectedMessage.thread_id || 'None'}
                            </Typography>
                            <Typography variant="body1">
                                <strong>Created At:</strong> {new Date(selectedMessage.create_at).toLocaleString()}
                            </Typography>
                            <Typography variant="body1">
                                <strong>User ID:</strong> {selectedMessage.user_id}
                            </Typography>
                            {selectedMessage.props && Object.entries(selectedMessage.props).map(([key, value]) => {
                                const isProjectId = key === 'project-id';
                                return (
                                    <Box key={key} sx={{
                                        p: 1,
                                        bgcolor: 'background.paper',
                                        borderRadius: 1,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        mb: 1
                                    }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                            {key}
                                        </Typography>
                                        {isProjectId ? (
                                            <Button
                                                variant="text"
                                                sx={{
                                                    p: 0,
                                                    textTransform: 'none',
                                                    justifyContent: 'flex-start',
                                                    '&:hover': {
                                                        textDecoration: 'underline'
                                                    }
                                                }}
                                                onClick={() => {
                                                    const projectTasks = tasks.filter(t => t.projectId === value);
                                                    if (projectTasks.length > 0) {
                                                        setSelectedMessage(null);
                                                        setMetadataDialogOpen(false);
                                                        setSelectedTask(projectTasks[0]);
                                                        setTaskDialogOpen(true);
                                                    } else {
                                                        // If no tasks found, create a new task for this project
                                                        setSelectedTask({
                                                            projectId: value,
                                                            description: `New task for project ${value}`,
                                                            type: 'standard',
                                                            complete: false,
                                                            inProgress: false,
                                                            createdAt: new Date().toISOString(),
                                                            updatedAt: new Date().toISOString()
                                                        });
                                                        setTaskDialogOpen(true);
                                                    }
                                                }}
                                            >
                                                <Typography variant="body2" sx={{
                                                    whiteSpace: 'pre-wrap',
                                                    wordBreak: 'break-word'
                                                }}>
                                                    {value}
                                                </Typography>
                                            </Button>
                                        ) : (
                                            <Typography variant="body2" sx={{
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word'
                                            }}>
                                                {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                            </Typography>
                                        )}
                                    </Box>
                                );
                            })}
                        </Stack>
                    )}
                </DialogContent>
            </Dialog>

            <TaskDialog
                open={taskDialogOpen}
                onClose={() => setTaskDialogOpen(false)}
                selectedTask={selectedTask}
                setSelectedTask={setSelectedTask}
                tasks={tasks}
            />
        </Box>
    );
};
