import React, { useEffect, useState } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { useWebSocket } from '../contexts/DataContext';
import { ArtifactViewer } from './ArtifactViewer';

interface ArtifactPanelProps {
    channelId: string | null;
    threadId: string | null;
}

export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ channelId, threadId }) => {
    const { artifacts, fetchArtifacts } = useWebSocket();
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);

    useEffect(() => {
        let isSubscribed = true;

        const loadArtifacts = async () => {
            if (channelId && isSubscribed) {
                await fetchArtifacts(channelId, threadId);
            }
        };

        loadArtifacts();

        return () => {
            isSubscribed = false;
        };
    }, [channelId, threadId]);

    return (
        <div className="artifact-panel">
            <h2>Artifacts</h2>
            <ul>
                {(artifacts || []).map((artifact : Artifact) => (
                    <li 
                        key={artifact.id} 
                        className={`artifact-item type-${artifact.type}`}
                        onClick={() => setSelectedArtifact(artifact)}
                    >
                        <span className="artifact-type">{artifact.type}</span>
                        <span className="artifact-title">{artifact.metadata?.title || 'Untitled'}</span>
                        <span className="artifact-id">#{artifact.id}</span>
                    </li>
                ))}
            </ul>
            <ArtifactViewer 
                artifact={selectedArtifact} 
                onClose={() => setSelectedArtifact(null)}
            />
        </div>
    );
};
