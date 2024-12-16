import React, { useEffect } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { useWebSocket } from '../contexts/WebSocketContext';

interface ArtifactPanelProps {
    channelId: string | null;
    threadId: string | null;
}

export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ channelId, threadId }) => {
    const { artifacts, fetchArtifacts } = useWebSocket();

    useEffect(() => {
        if (channelId) {
            fetchArtifacts(channelId, threadId);
        }
    }, [channelId, threadId, fetchArtifacts]);

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
