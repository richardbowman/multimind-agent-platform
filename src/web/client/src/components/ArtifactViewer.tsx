import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm'
import { Artifact } from '../../../../tools/artifact';
import { Paper, Typography, Button, Box } from '@mui/material';

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
Type: ${artifact.type}

## Metadata
${formatMetadata(artifact.metadata)}

## Content
${artifact.content?.toString()||"(no content available)"}`;

    return (
        <Box sx={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            bgcolor: 'rgba(0, 0, 0, 0.75)', 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            zIndex: 1000 
        }} onClick={onClose}>
            <Paper sx={{ 
                bgcolor: '#2a2a2a', 
                borderRadius: 8, 
                width: '80%', 
                maxWidth: 1000, 
                maxHeight: '80vh', 
                position: 'relative', 
                border: '1px solid #444' 
            }} onClick={e => e.stopPropagation()}>
                <Button sx={{ 
                    position: 'absolute', 
                    top: 1, 
                    right: 1, 
                    bgcolor: 'none', 
                    border: 'none', 
                    color: '#999', 
                    fontSize: 1.5, 
                    cursor: 'pointer', 
                    p: 0.5, 
                    lineHeight: 1, 
                    borderRadius: 4 
                }} onClick={onClose}>×</Button>
                <Box sx={{ p: 2, overflowY: 'auto', maxHeight: 'calc(80vh - 4rem)' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </Box>
            </Paper>
        </Box>
    );
};
