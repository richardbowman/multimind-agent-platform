import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Artifact } from '../../../../tools/artifact';
import { Typography, Box, IconButton } from '@mui/material';
import { Edit, Delete } from '@mui/icons-material';

interface ArtifactViewerProps {
    artifact: Artifact | null;
    onClose: () => void;
}

export const ArtifactViewer: React.FC<ArtifactViewerProps> = ({ artifact, onClose }) => {
    if (!artifact) return null;

    const formatMetadata = (metadata: Record<string, any> | undefined) => {
        if (!metadata) return '*No metadata available*';
        
        return Object.entries(metadata)
            .map(([key, value]) => `- **${key}**: ${value}`)
            .join('\n');
    };

    const content = `# ${artifact.metadata?.title || artifact.id}

## Metadata
${formatMetadata(artifact.metadata)}

## Content
${artifact.content?.toString()||"(no content available)"}`;

    return (
        <Box sx={{ 
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            m: 0,
            p: 3
        }}>
            <Box sx={{
                maxWidth: '800px',
                mx: 'auto',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                position: 'relative'
            }}>
                <Box sx={{ 
                    flex: 0,
                    mb: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start'
                }}>
                    <Box>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{`# ${artifact.metadata?.title || artifact.id}

## Metadata
${formatMetadata(artifact.metadata)}`}</ReactMarkdown>
                    </Box>
                    <Box sx={{
                        position: 'absolute',
                        right: 0,
                        top: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1
                    }}>
                        <IconButton 
                            size="small" 
                            sx={{ 
                                backgroundColor: 'background.paper',
                                boxShadow: 1,
                                '&:hover': {
                                    backgroundColor: 'action.hover'
                                }
                            }}
                        >
                            <Edit fontSize="small" />
                        </IconButton>
                        <IconButton 
                            size="small" 
                            sx={{ 
                                backgroundColor: 'background.paper',
                                boxShadow: 1,
                                '&:hover': {
                                    backgroundColor: 'error.light'
                                }
                            }}
                        >
                            <Delete fontSize="small" color="error" />
                        </IconButton>
                    </Box>
                </Box>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{`# ${artifact.metadata?.title || artifact.id}

## Metadata
${formatMetadata(artifact.metadata)}`}</ReactMarkdown>
                </Box>
                <Box sx={{ 
                    flex: 1,
                    overflow: 'auto',
                    mt: 2
                }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{`## Content
${artifact.content?.toString()||"(no content available)"}`}</ReactMarkdown>
                </Box>
            </Box>
        </Box>
    );
};
