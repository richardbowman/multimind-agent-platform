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
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    );
};
