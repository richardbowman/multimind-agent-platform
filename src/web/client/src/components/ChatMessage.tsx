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
import { Artifact } from '../../../../tools/artifact';
import { ToolbarActionsProvider } from '../contexts/ToolbarActionsContext';

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
    onViewMetadata
}) => {
    const isExpanded = expandedMessages.has(message.id);
    const hasThread = !currentThreadId && message.replyCount||0 > 0;
    const [showAttachments, setShowAttachments] = useState(isExpanded && (message.showAttachments || message.props?.artifactIds?.length > 0));
    const uniqueArtifacts = [...new Set((message.props?.artifactIds||[]).filter(a => a))];
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
                            onClick={() => onViewThread(message.id)}
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
                                <ReplyIcon sx={{ transform: 'rotate(-90deg)' }} />
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
                                onClick={() => setShowAttachments(!showAttachments)}
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
                        pre: ({node, ...props}) => (
                            <div {...props} />
                        ),
                        code({node, inline, className, children, ...props}) {
                            // Skip rendering code blocks when collapsed
                            if (!isExpanded && !inline) {
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

                            const match = /language-(\w+)(?:\s*\[hidden\])?/.exec(className || '');
                            const content = String(children).replace(/\n$/, '');
                            const isHidden = className?.includes('[hidden]');
                            
                            if (!inline && match) {
                                return isHidden ? null : (
                                    <ToolbarActionsProvider>
                                        <CodeBlock 
                                            language={match[1]} 
                                            content={content}
                                        />
                                    </ToolbarActionsProvider>
                                );
                            }

                            return isHidden ? null : (
                                <code className={className} {...props} style={{
                                    display: inline ? 'inline' : 'block',
                                    whiteSpace: inline ? 'normal' : 'pre-wrap'
                                }}>
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
                    <Collapse in={true}>
                        <Box sx={{ mt: 1 }}>
                            {uniqueArtifacts.filter(a => a).map((artifactId: string) => (
                                <ArtifactLoader 
                                    key={artifactId}
                                    artifactId={artifactId}
                                />
                            ))}
                        </Box>
                    </Collapse>
                </Box>
            )}
        </Paper>
    );
};
