import React from 'react';
import {
    Box,
    Typography,
    Button,
    Paper
} from '@mui/material';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from './shared/CodeBlock';
import { Spinner } from './Spinner';
import { CustomLink } from './ChatPanel';

interface ChatMessageProps {
    message: any;
    handles: any[];
    expandedMessages: Set<string>;
    messageVersions: Record<string, number>;
    currentThreadId?: string;
    messages: any[];
    onToggleExpansion: (messageId: string) => void;
    onViewThread: (messageId: string) => void;
    onViewMetadata: (message: any) => void;
}

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
    const hasThread = !currentThreadId && messages.some(m => m.props?.['root-id'] === message.id);

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
                {!isExpanded && (
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
                            onClick={() => onToggleExpansion(message.id)}
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
                {isExpanded && message.message.split('\n').length > 3 && (
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
                            onClick={() => onToggleExpansion(message.id)}
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
                {isExpanded && hasThread && (
                    <Box
                        onClick={() => onViewThread(message.id)}
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
    );
};
