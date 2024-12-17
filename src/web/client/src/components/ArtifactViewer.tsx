import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Artifact } from '../../../../tools/artifact';

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
        <div className="artifact-viewer-overlay" onClick={onClose}>
            <div className="artifact-viewer" onClick={e => e.stopPropagation()}>
                <button className="close-button" onClick={onClose}>×</button>
                <div className="artifact-content">
                    <ReactMarkdown>{content}</ReactMarkdown>
                </div>
            </div>
        </div>
    );
};
