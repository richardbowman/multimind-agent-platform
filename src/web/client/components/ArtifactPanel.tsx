import React, { useState, useEffect } from 'react';
import { Artifact } from '../../../tools/artifact';

interface ArtifactPanelProps {
    channelId: string | null;
    threadId: string | null;
}

export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ channelId, threadId }) => {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);

    useEffect(() => {
        // TODO: Implement actual artifact fetching
        if (channelId) {
            setArtifacts([
                { id: '1', type: 'report', content: 'Sample Report', metadata: { created: new Date() } },
                { id: '2', type: 'draft-email', content: 'Draft Email Content', metadata: { created: new Date() } },
            ]);
        }
    }, [channelId, threadId]);

    return (
        <div className="artifact-panel">
            <h2>Artifacts</h2>
            <ul>
                {artifacts.map(artifact => (
                    <li key={artifact.id} className={`artifact-item type-${artifact.type}`}>
                        <span className="artifact-type">{artifact.type}</span>
                        <span className="artifact-id">#{artifact.id}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};
