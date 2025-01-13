import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Artifact } from '../../../../tools/artifact';
import { Typography, Box } from '@mui/material';

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
                flex: 1
            }}>
                <Box sx={{ 
                    flex: 0,
                    mb: 2
                }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{`# ${artifact.metadata?.title || artifact.id}

## Metadata
${formatMetadata(artifact.metadata)}`}</ReactMarkdown>
                </Box>
                <Box sx={{ 
                    flex: 1,
                    overflow: 'auto'
                }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{`## Content
${artifact.content?.toString()||"(no content available)"}`}</ReactMarkdown>
                </Box>
            </Box>
        </Box>
    );
};
