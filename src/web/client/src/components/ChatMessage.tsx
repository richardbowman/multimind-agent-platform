import React, { useState } from 'react';
import {
    Box,
    Typography,
    Button,
    Paper,
    Collapse,
    IconButton
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
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
            <CodeBlock 
                content={artifact.content.toString()}
                language={artifact.type}
                title={artifact.metadata?.title || `Artifact ${artifactId}`}
            />
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
    const hasThread = !currentThreadId && message.replyCount > 0;
    const [showAttachments, setShowAttachments] = useState(false);
    const hasAttachments = message.props?.artifactIds?.filter(Boolean).length > 0;

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
                        {(message.message.split('\n').length > 3 || isExpanded) && (
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
                                {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
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
                                <ExpandMoreIcon sx={{ transform: 'rotate(-90deg)' }} />
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
                                    {message.props.artifactIds.length > 0 && (
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
                                            {message.props.artifactIds.length}
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
                            if (message.props?.partial) {
                                return (
                                    <Box component="span" sx={{
                                        bgcolor: 'background.default',
                                        p: '2px 4px',
                                        borderRadius: 1,
                                        fontFamily: 'monospace'
                                    }}>
                                        {children}
                                    </Box>
                                );
                            }
                            
                            // Skip rendering code blocks when collapsed
                            if (!isExpanded && !inline) {
                                return (
                                    <Box component="span" sx={{
                                        bgcolor: 'background.default',
                                        p: '2px 4px',
                                        borderRadius: 1,
                                        fontFamily: 'monospace'
                                    }}>
                                        {'[code block]'}
                                    </Box>
                                );
                            }

                            const match = /language-(\w+)(?:\s*\[hidden\])?/.exec(className || '');
                            const content = String(children).replace(/\n$/, '');
                            const isHidden = className?.includes('[hidden]');
                            
                            if (!inline && match) {
                                return isHidden ? null : (
                                    <CodeBlock 
                                        language={match[1]} 
                                        content={content}
                                    />
                                );
                            }

                            return isHidden ? null : (
                                <div className={className} {...props}>
                                    {children}
                                </div>
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
                background: !isExpanded ? 'linear-gradient(to bottom, rgba(42,42,42,0) 0%, rgba(24,24,24,1) 100%)' : undefined,
                borderRadius: 2
            }}>
                {(message.inProgress || message.props?.partial) && (
                    <Box sx={{ 
                        display: 'flex', 
                        alignItems: 'center',
                        gap: 1,
                        mt: 1
                    }}>
                        <Spinner size={20} />
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                            Streaming response...
                        </Typography>
                    </Box>
                )}
            </Box>
            {hasAttachments && (
                <Box sx={{ mt: 2 }}>
                    <Collapse in={showAttachments}>
                        <Box sx={{ mt: 1 }}>
                            {message.props.artifactIds.map((artifactId: string) => (
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
