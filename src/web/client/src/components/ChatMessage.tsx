import React, { useEffect, useState } from 'react';
import {
    Box,
    Typography,
    Button,
    Paper,
    Collapse,
    IconButton
} from '@mui/material';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import ReplyIcon from '@mui/icons-material/Reply';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { CodeBlock } from './shared/CodeBlock';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Spinner } from './Spinner';
import { CustomLink } from './ChatPanel';
import { UUID } from '../../../../types/uuid';
import { ChatPost } from '../../../../chat/chatClient';
import { useIPCService } from '../contexts/IPCContext';
import { useArtifacts } from '../contexts/ArtifactContext';
import { ArtifactDrawer } from './ArtifactDrawer';
import { Artifact, ArtifactItem } from '../../../../tools/artifact';
import { ToolbarActionsProvider, useToolbarActions } from '../contexts/ToolbarActionsContext';
import { AttachmentCard } from './shared/AttachmentCard';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

interface ChatMessageProps {
    message: ChatPost;
    handles: any[];
    expandedMessages: Set<string>;
    messageVersions: Record<string, number>;
    currentThreadId?: UUID;
    messages: any[];
    onToggleExpansion: (messageId: string) => void;
    onViewThread: (messageId: string) => void;
    onViewMetadata: (message: any) => void;
    unreadChildren: Set<string>;
    onMessageRead: (messageId: string) => void;
}

const ArtifactLoader: React.FC<{ artifactId: string }> = ({ artifactId }) => {
    const ipcService = useIPCService();
    const [artifact, setArtifact] = useState<Artifact | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadArtifact = async () => {
            try {
                const artifact = await ipcService.getRPC().getArtifact(artifactId);
                setArtifact(artifact);
            } catch (err) {
                setError('Failed to load artifact');
                console.error('Error loading artifact:', err);
            } finally {
                setLoading(false);
            }
        };

        loadArtifact();
    }, [artifactId, ipcService]);

    if (loading) {
        return (
            <Box sx={{ mb: 2 }}>
                <CodeBlock 
                    content="Loading artifact..."
                    language="text"
                    title={`Artifact ${artifactId}`}
                />
            </Box>
        );
    }

    if (error) {
        return (
            <Box sx={{ mb: 2 }}>
                <CodeBlock 
                    content={error}
                    language="text"
                    title={`Error loading artifact ${artifactId}`}
                />
            </Box>
        );
    }

    if (!artifact) {
        return null;
    }

    return (
        <Box sx={{ mb: 2 }}>
            <ToolbarActionsProvider><CodeBlock 
                content={artifact.content.toString()}
                language={artifact.type}
                title={artifact.metadata?.title || `Artifact ${artifactId}`}
            />
            </ToolbarActionsProvider>
        </Box>
        
    );
};

export const ChatMessage: React.FC<ChatMessageProps> = ({
    message,
    handles,
    expandedMessages,
    messageVersions,
    currentThreadId,
    messages,
    onToggleExpansion,
    onViewThread,
    onViewMetadata,
    unreadChildren,
    onMessageRead
}) => {
    const isExpanded = expandedMessages.has(message.id);
    const hasUnreadReplies = unreadChildren.has(message.id);
    const hasThread = !currentThreadId && message.replyCount||0 > 0;
    const [attachmentsExpanded, setAttachmentsExpanded] = useState(false);
    const { artifacts: allArtifacts } = useArtifacts();
    const ipcService = useIPCService();
    const [uniqueArtifacts, setUniqueArtifacts] = useState<Array<string>>([]);

    // Watch for changes in message's artifact IDs
    useEffect(() => {
        const ids = message.props?.artifactIds || [];
        setUniqueArtifacts(Array.from(new Set(ids.filter(a => a))));
    }, [message.props?.artifactIds]);
    const [selectedArtifact, setSelectedArtifact] = useState<ArtifactItem | null>(null);
    const [loadedArtifact, setLoadedArtifact] = useState<Artifact | null>(null);
    const [currentAttachmentIndex, setCurrentAttachmentIndex] = useState(0);
    const { registerActions, unregisterActions } = useToolbarActions();

    const handleRemoveArtifact = async (artifactId: string) => {
        try {
            // Update message metadata via IPC
            await ipcService.getRPC().removeMessageAttachment(message.id, artifactId);
            
            // Update local state using current message props
            const updatedIds = (message.props?.artifactIds || []).filter(id => id !== artifactId);
            setUniqueArtifacts(Array.from(new Set(updatedIds.filter(a => a))));
        } catch (err) {
            console.error('Error removing artifact:', err);
            // Revert if update fails
            setUniqueArtifacts([...new Set((message.props?.artifactIds||[]).filter(a => a))]);
        }
    };

    useEffect(() => {
        const loadArtifactContent = async () => {
            if (selectedArtifact) {
                try {
                    const artifact = await ipcService.getRPC().getArtifact(selectedArtifact.id);
                    setLoadedArtifact(artifact);
                    // Set current index based on selected artifact
                    const index = uniqueArtifacts.indexOf(selectedArtifact.id);
                    if (index >= 0) {
                        setCurrentAttachmentIndex(index);
                    }
                } catch (err) {
                    console.error('Error loading artifact content:', err);
                    setLoadedArtifact(null);
                }
            }
        };

        loadArtifactContent();
    }, [selectedArtifact, ipcService, uniqueArtifacts]);

    // Register navigation actions when viewing an attachment
    useEffect(() => {
        if (!loadedArtifact) return;

        const navigationActions = [
            {
                icon: <ChevronLeftIcon />,
                label: 'Previous Attachment',
                onClick: () => {
                    const prevIndex = currentAttachmentIndex - 1;
                    if (prevIndex >= 0) {
                        const artifactId = uniqueArtifacts[prevIndex];
                        const artifact = allArtifacts.find(a => a.id === artifactId);
                        if (artifact) {
                            setSelectedArtifact({
                                id: artifact.id,
                                type: artifact.type,
                                metadata: artifact.metadata,
                                tokenCount: artifact.tokenCount
                            });
                            setCurrentAttachmentIndex(prevIndex);
                        }
                    }
                },
                disabled: currentAttachmentIndex === 0
            },
            {
                icon: <ChevronRightIcon />,
                label: 'Next Attachment',
                onClick: () => {
                    const nextIndex = currentAttachmentIndex + 1;
                    if (nextIndex < uniqueArtifacts.length) {
                        const artifactId = uniqueArtifacts[nextIndex];
                        const artifact = allArtifacts.find(a => a.id === artifactId);
                        if (artifact) {
                            setSelectedArtifact({
                                id: artifact.id,
                                type: artifact.type,
                                metadata: artifact.metadata,
                                tokenCount: artifact.tokenCount
                            });
                            setCurrentAttachmentIndex(nextIndex);
                        }
                    }
                },
                disabled: currentAttachmentIndex === uniqueArtifacts.length - 1
            }
        ];

        registerActions('message-attachments', navigationActions);
        return () => unregisterActions('message-attachments');
    }, [currentAttachmentIndex, loadedArtifact, uniqueArtifacts, allArtifacts, registerActions, unregisterActions]);
    const hasAttachments = uniqueArtifacts.length||0 > 0;
    const inProgress = message.props?.partial;

    return (
        <Paper key={`${message.id}-${messageVersions[message.id] || 0}`} sx={{
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            cursor: 'pointer',
                            '&:hover': {
                                textDecoration: 'underline'
                            }
                        }}
                        onClick={() => onViewMetadata(message)}
                    >
                        {new Date(message.create_at).toLocaleString()}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {(message.message.split('\n').length > 3 || isExpanded || !isExpanded) && (
                            <IconButton
                                size="small"
                                onClick={() => onToggleExpansion(message.id)}
                                sx={{
                                    p: 0.5,
                                    bgcolor: 'action.hover',
                                    '&:hover': {
                                        bgcolor: 'action.selected'
                                    }
                                }}
                            >
                                {isExpanded ? <UnfoldLessIcon /> : <UnfoldMoreIcon />}
                            </IconButton>
                        )}
                        {hasThread && (
                        <IconButton
                            size="small"
                            onClick={() => {
                                onViewThread(message.id);
                                if (onMessageRead) {
                                    onMessageRead(message.id);
                                }
                            }}
                            sx={{
                                p: 0.5,
                                bgcolor: 'action.hover',
                                '&:hover': {
                                    bgcolor: 'action.selected'
                                }
                            }}
                        >
                            <Box sx={{ 
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <ReplyIcon sx={{
                                    '@keyframes pulseColor': {
                                        '0%': {
                                            color: 'primary.main'
                                        },
                                        '50%': {
                                            color: 'primary.dark'
                                        },
                                        '100%': {
                                            color: 'primary.main'
                                        }
                                    },
                                    animation: hasThread && hasUnreadReplies ? 'pulseColor 1.5s infinite' : 'none'
                                }} />
                                {message.replyCount > 0 && (
                                    <Box sx={{
                                        position: 'absolute',
                                        top: -6,
                                        right: -6,
                                        bgcolor: 'primary.main',
                                        color: 'primary.contrastText',
                                        borderRadius: '50%',
                                        width: 16,
                                        height: 16,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.6rem',
                                        border: '1px solid',
                                        borderColor: 'background.paper'
                                    }}>
                                        {message.replyCount}
                                    </Box>
                                )}
                            </Box>
                        </IconButton>
                        )}
                        {hasAttachments && (
                            <IconButton
                                size="small"
                                onClick={() => setAttachmentsExpanded(!attachmentsExpanded)}
                                disabled={!isExpanded}
                                sx={{
                                    p: 0.5,
                                    bgcolor: 'action.hover',
                                    '&:hover': {
                                        bgcolor: 'action.selected'
                                    }
                                }}
                            >
                                <Box sx={{ 
                                    position: 'relative',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <AttachFileIcon fontSize="small" />
                                    {uniqueArtifacts.length > 0 && (
                                        <Box sx={{
                                            position: 'absolute',
                                            top: -6,
                                            right: -6,
                                            bgcolor: 'primary.main',
                                            color: 'primary.contrastText',
                                            borderRadius: '50%',
                                            width: 16,
                                            height: 16,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '0.6rem',
                                            border: '1px solid',
                                            borderColor: 'background.paper'
                                        }}>
                                            {uniqueArtifacts.length}
                                        </Box>
                                    )}
                                </Box>
                            </IconButton>
                        )}
                    </Box>
                </Box>
            </Box>
            <Box sx={{
                position: 'relative',
                overflow: 'hidden',
                maxHeight: isExpanded ? 'none' : '4.5em',
                ...(message.props?.partial && {
                    borderLeft: '4px solid',
                    borderColor: 'primary.main',
                    pl: 2,
                    mb: 1
                })
            }}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        a: CustomLink,
                        pre: ({node, children, className, ...props}) => {
                            // Check if this pre contains a code block
                            const hasCodeBlock = node.children?.some(
                                child => child.type === 'element' && child.tagName === 'code'
                            );
                            
                            // Skip rendering code blocks when collapsed
                            if (!isExpanded && hasCodeBlock) {
                                const isJson = className?.includes('language-json');
                                return (
                                    <Box component="span" sx={{
                                        bgcolor: 'background.default',
                                        p: '2px 4px',
                                        borderRadius: 1,
                                        fontFamily: 'monospace'
                                    }}>
                                        {isJson ? '[JSON]' : '[code block]'}
                                    </Box>
                                );
                            }

                            // Find the code element inside the pre block
                            const codeNode = node.children?.find(
                                child => child.type === 'element' && child.tagName === 'code'
                            );
                            
                            // Get the language from the code element's className
                            const codeClassName = codeNode?.properties?.className?.toString() || '';
                            const match = /language-(\w+)(?:\s*\[hidden\])?/.exec(codeClassName);
                            // Extract text content from code block children
                            const content = codeNode?.children
                                ?.filter(child => child.type === 'text')
                                .map(child => child.value)
                                .join('')
                                .replace(/\n$/, '') || '';
                            const isHidden = codeClassName?.includes('[hidden]');
                            
                            if (match) {
                                const language = match[1];
                                if (isHidden) return null;
                                
                                // Special handling for CSV
                                if (language === 'csv') {
                                    return (
                                        <ToolbarActionsProvider>
                                            <CodeBlock 
                                                language={language}
                                                content={content}
                                                renderAs="spreadsheet"
                                            />
                                        </ToolbarActionsProvider>
                                    );
                                }
                                
                                return (
                                    <ToolbarActionsProvider>
                                        <CodeBlock 
                                            language={language} 
                                            content={content}
                                        />
                                    </ToolbarActionsProvider>
                                );
                            }

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
                margin: '-20px',
                padding: '20px',
                background: !isExpanded ? theme => {
                    const bgColor = theme.palette.mode === 'dark' 
                        ? theme.palette.background.default 
                        : theme.palette.background.paper;
                    return `linear-gradient(to bottom, transparent 0%, ${bgColor} 100%)`;
                } : undefined,
                borderRadius: 2
            }}>
                {(inProgress) && (
                    <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: 1,
                        mt: 1
                    }}>
                        <Spinner size={20} />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Partial response, still working...
                        </Typography>
                    </Box>
                )}
            </Box>
            {hasAttachments && isExpanded && (
                <Box sx={{ mt: 2 }}>
                    {!attachmentsExpanded && (
                        <Box sx={{ 
                            display: 'flex', 
                            gap: 1, 
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            maxWidth: '100%'
                        }}>
                            {uniqueArtifacts
                                .filter(a => a)
                                .slice(0, 6)
                                .map((artifactId: string) => {
                                    const artifact = allArtifacts.find(a => a.id === artifactId);
                                    return artifact && ( 
                                    <AttachmentCard
                                        key={artifactId}
                                        type="artifact"
                                        title={artifact?.metadata?.title || `Artifact ${artifactId.slice(0, 6)}...`}
                                        subtitle={artifact?.type}
                                        onRemove={() => handleRemoveArtifact(artifactId)}
                                        onClick={() => {
                                            if (artifact) {
                                                setSelectedArtifact({
                                                    id: artifact.id,
                                                    type: artifact.type,
                                                    metadata: artifact.metadata,
                                                    tokenCount: artifact.tokenCount
                                                });
                                            }
                                        }}
                                    />
                                );})}
                            {uniqueArtifacts.length > 6 && (
                                <Typography variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                                    and {uniqueArtifacts.length - 6} more...
                                </Typography>
                            )}
                        </Box>
                    )}
                    {attachmentsExpanded && (
                    <Collapse in={attachmentsExpanded}>
                        <Box sx={{ mt: 1 }}>
                            {uniqueArtifacts
                                .filter(a => a)
                                .map((artifactId: string, index) => (
                                    <Box key={artifactId} sx={{ display: index < 3 ? 'block' : 'none' }}>
                                        <ArtifactLoader 
                                            artifactId={artifactId}
                                        />
                                    </Box>
                                ))}
                        </Box>
                    </Collapse>)}
                </Box>
            )}
            {loadedArtifact && (
                    <ArtifactDrawer
                        open={!!loadedArtifact}
                        onClose={() => {
                            setSelectedArtifact(null);
                            setLoadedArtifact(null);
                        }}
                        currentArtifact={loadedArtifact}
                        actions={[
                            {
                                label: 'Close',
                                onClick: () => { 
                                    setSelectedArtifact(null)
                                    setLoadedArtifact(null);
                                },
                                variant: 'outlined'
                            }
                        ]}
                        title={`Attachment ${currentAttachmentIndex + 1} of ${uniqueArtifacts.length}`}
                    />
            )}
        </Paper>
    );
};
