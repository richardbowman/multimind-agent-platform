import React, { useEffect, useRef, useState, useCallback, useMemo, useContext } from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatHeader } from './ChatHeader';
import { ChatDetailsDialog } from './ChatDetailsDialog';
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
import { useTasks } from '../contexts/TaskContext';
import { useIPCService } from '../contexts/IPCContext';
import remarkGfm from 'remark-gfm';
import Link from '@mui/material/Link';
import { TaskDialog } from './TaskDialog';
import { ClientProject } from '../../../../shared/types';
import { CodeBlock } from './shared/CodeBlock';
import { WelcomePanel } from './WelcomePanel.tsx';
import { TaskType } from '../../../../tools/taskManager.ts';
import { useThreadMessages } from '../contexts/ThreadMessageContext.tsx';
import { useMessages } from '../contexts/MessageContext.tsx';
import { useChannels } from '../contexts/ChannelContext.tsx';
import { useFilteredTasks } from '../contexts/FilteredTaskContext.tsx';
import { useTheme } from '@mui/material/styles';
import { ScrollView } from './shared/ScrollView.tsx';
import { InProgressTasks } from './InProgressTasks';
import { ToolbarActionsProvider } from '../contexts/ToolbarActionsContext.tsx';

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
    rightDrawerWidth: number;
    onSwitchToWelcome: (showWelcome: boolean) => void;
    showWelcome: boolean;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ leftDrawerOpen, rightDrawerOpen, rightDrawerWidth, showWelcome, onSwitchToWelcome }) => {
    const theme = useTheme();
    const { threadMessages: messages } = useThreadMessages();
    const { unreadChildren, markMessageRead } = useMessages();
    const { sendMessage, currentChannelId, currentThreadId, setCurrentThreadId } = useMessages();
    const { handles, isLoading } = useDataContext();
    const { filteredTasks: tasks } = useFilteredTasks();
    const { channels } = useChannels();

    const [selectedMessage, setSelectedMessage] = useState<any>(null);
    const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
    const [messageVersions, setMessageVersions] = useState<Record<string, number>>({});

    // Watch for message updates
    useEffect(() => {
        const updatedMessages = messages.filter(m => m.updated_at);
        if (updatedMessages.length > 0) {
            setMessageVersions(prev => {
                const newVersions = { ...prev };
                updatedMessages.forEach(m => {
                    newVersions[m.id] = (newVersions[m.id] || 0) + 1;
                });
                return newVersions;
            });
        }
    }, [messages]);

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
            })
            .sort((a, b) => a.create_at - b.create_at); // Sort by create_at ascending

        // Always expand the last message and its attachments
        if (filtered.length > 0) {
            const lastMessage = filtered[filtered.length - 1];
            const idsToExpand = [lastMessage.id];

            // If last message has attachments, expand them too
            if (lastMessage.props?.artifactIds?.length > 0) {
                // Set showAttachments to true for the last message
                lastMessage.showAttachments = true;
            }

            setExpandedMessages(prev => new Set([...prev, ...idsToExpand]));
        }

        return filtered;
    }, [messages, currentChannelId, currentThreadId, messageVersions]);

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


    const [isAtBottom, setIsAtBottom] = useState(true);
    const messagesContainerRef = useRef<HTMLDivElement>(null);

    const checkScrollPosition = useCallback(() => {
        if (messagesContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
            const newIsAtBottom = scrollHeight - (scrollTop + clientHeight) < 200;
            return newIsAtBottom;
        }
        return true;
    }, []);

    useEffect(() => {
        const container = messagesContainerRef.current;
        if (container) {
            const scrollHandler = () => {
                const newIsAtBottom = checkScrollPosition();
                setIsAtBottom(newIsAtBottom);
            };
            container.addEventListener('scroll', scrollHandler);
            return () => {
                container.removeEventListener('scroll', scrollHandler);
            };
        }
    }, [checkScrollPosition]);

    const scrollToBottom = useCallback(() => {
        if (isAtBottom && messagesEndRef.current) {
            // console.debug('scrollToBottom activated');
            setTimeout(() => messagesEndRef.current?.scrollIntoView(), 500);
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


    // Scroll to bottom when new messages come in for current thread/channel
    useEffect(() => {
        const relevantMessages = messages.filter(message =>
            message.channel_id === currentChannelId &&
            (currentThreadId
                ? message.id === currentThreadId || message.props?.['root-id'] === currentThreadId
                : !message.props?.['root-id'])
        );

        // console.debug('Messages changed - relevant messages:', relevantMessages.length);
        // console.debug('isAtBottom:', isAtBottom);

        if (relevantMessages.length > 0) {
            if (isAtBottom) {
                // console.debug('Scrolling to bottom');
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

        if (relevantMessages.length > 0) {
            console.debug('Scrolling to bottom');
            // Use a timeout to ensure this runs after render
            setTimeout(() => setIsAtBottom(true), 0);
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

        // console.debug('Checking in-progress messages:', hasRelevantInProgress);
        // console.debug('isAtBottom:', isAtBottom);

        if (hasRelevantInProgress) {
            if (isAtBottom) {
                console.debug('Scrolling to bottom for in-progress message');
                // scrollToBottom();
            } else {
                console.debug('Not scrolling - user is not at bottom');
            }
        }
    }, [messages]);

    // Track last channel ID to detect channel changes
    const lastChannelId = useRef<string | null>(null);

    // Show welcome panel only when:
    // 1. Switching to a new channel
    // 2. The new channel has remaining goal tasks
    // 3. The channel has no other messages besides the welcome message
    useEffect(() => {
        const channelTasks = tasks.filter(t => t.channelId === currentChannelId);
        const channelMessages = messages.filter(m => m.channel_id === currentChannelId);

        const lastChannelTasks = tasks.filter(t => t.channelId === lastChannelId.current);
        const lastChannelMessages = messages.filter(m => m.channel_id === lastChannelId.current);

        if (lastChannelTasks.length > 0 && lastChannelMessages.length > 0) return;

        if (channelMessages.length > 0) {
            if (currentChannelId && currentChannelId !== lastChannelId.current && currentThreadId === null && tasks.length > 0) {
                // Only consider tasks for the current channel
                const hasRemainingGoals = channelTasks.some(t => !t.complete && t.type === TaskType.Goal);

                // Only consider messages for the current channel
                const hasOnlyWelcomeMessage = channelMessages.length === 0 ||
                    channelMessages.every(m => m.props?.messageType === 'welcome');

                onSwitchToWelcome(hasRemainingGoals && hasOnlyWelcomeMessage);
            } else {
                onSwitchToWelcome(false);
            }
            lastChannelId.current = currentChannelId;
        }
    }, [currentChannelId, currentThreadId, tasks, messages]);

    const [lastMessage, setLastMessage] = useState<string | null>(null);

    const handleSendMessage = async (content: string, artifactIds?: string) => {
        try {
            if (!currentChannelId) return;
            
            // If welcome panel is showing, switch to chat view
            if (showWelcome) {
                onSwitchToWelcome(false);
            }

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
                                    artifactIds
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
                                    artifactIds
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
                    artifactIds,
                    ...(currentThreadId ? { 'root-id': currentThreadId } : {})
                }
            };

            sendMessage(message);
        } catch (e) {
            console.error(e);
            throw e;
        }
    };

    const uniqueTasks = Array.from(new Map((tasks || []).map(task => [task.id, task])).values()).filter(t => t.inProgress);

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: 'calc(100vh - 64px)',
            width: `calc(100vw - ${leftDrawerOpen ? 250 : 0}px - ${rightDrawerOpen ? rightDrawerWidth : 0}px)`,
            overflow: 'hidden',
            ml: leftDrawerOpen ? '250px' : 0,
            mr: 0,
            transition: 'all 225ms cubic-bezier(0, 0, 0.2, 1) 0ms'
        }}>
            {showWelcome ? (
                <WelcomePanel
                    onStartTask={(taskId) => {
                        // Handle task start
                        onSwitchToWelcome(false);
                    }}
                    onSwitchToChat={() => onSwitchToWelcome(false)}
                    messageType="welcome"
                />
            ) : (
                <ScrollView
                    ref={messagesContainerRef}
                    sx={{
                        flex: 1,
                        overflowX: 'hidden',
                        overflowY: 'auto',
                        p: 2,
                        bgcolor: 'background.paper',
                        width: '100%',
                    }}
                    onScroll={checkScrollPosition}
                >
                    {/* Project Overview and Goal Planning Cards */}
                    {!currentThreadId && (
                        <ChatHeader
                            currentProject={currentProject}
                            channels={channels}
                            tasks={tasks}
                            currentChannelId={currentChannelId}
                            handles={handles}
                            onTaskClick={(task) => {
                                setSelectedTask(task);
                                setTaskDialogOpen(true);
                            }}
                        />
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
                            <ToolbarActionsProvider>
                                <ChatMessage
                                    key={`${message.id}-${messageVersions[message.id] || 0}`}
                                    message={message}
                                    handles={handles}
                                    expandedMessages={expandedMessages}
                                    messageVersions={messageVersions}
                                    currentThreadId={currentThreadId}
                                    messages={messages}
                                    onToggleExpansion={toggleMessageExpansion}
                                    onViewThread={setCurrentThreadId}
                                    onViewMetadata={(message) => {
                                        setSelectedMessage(message);
                                        setMetadataDialogOpen(true);
                                    }}
                                    unreadChildren={unreadChildren}
                                    onMessageRead={markMessageRead}
                                />
                            </ToolbarActionsProvider>
                        )))}
                    <InProgressTasks tasks={uniqueTasks} />
                    <div ref={messagesEndRef} />
                </ScrollView>
            )}
            <Box sx={{ display: 'flex', gap: 1, p: 2 }}>
                <CommandInput
                    onSendMessage={handleSendMessage}
                    currentChannel={currentChannelId}
                    showWelcome={showWelcome}
                    onToggleWelcome={onSwitchToWelcome}
                    sx={{ flex: 1 }}
                />
            </Box>

            <ChatDetailsDialog
                open={metadataDialogOpen}
                onClose={() => setMetadataDialogOpen(false)}
                selectedMessage={selectedMessage}
                tasks={tasks}
                onTaskClick={(task) => {
                    setSelectedMessage(null);
                    setMetadataDialogOpen(false);
                    setSelectedTask(task);
                    setTaskDialogOpen(true);
                }}
            />

            <TaskDialog
                open={taskDialogOpen}
                onClose={() => setTaskDialogOpen(false)}
                selectedTask={selectedTask}
                setSelectedTask={setSelectedTask}
            />
        </Box>
    );
};
