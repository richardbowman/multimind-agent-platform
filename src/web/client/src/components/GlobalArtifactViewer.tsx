import React, { useEffect, useState } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { useWebSocket } from '../contexts/WebSocketContext';

export const GlobalArtifactViewer: React.FC = () => {
    const { artifacts, fetchAllArtifacts } = useWebSocket();
    const [selectedType, setSelectedType] = useState<string>('All Types');
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
    const [filteredArtifacts, setFilteredArtifacts] = useState<Artifact[]>([]);

    useEffect(() => {
        fetchAllArtifacts();
    }, []);

    useEffect(() => {
        if (artifacts) {
            setFilteredArtifacts(
                selectedType === 'All Types' 
                    ? artifacts 
                    : artifacts.filter(a => a.type === selectedType)
            );
        }
    }, [selectedType, artifacts]);

    const types = artifacts 
        ? ['All Types', ...Array.from(new Set(artifacts.map(a => a.type)))]
        : ['All Types'];

    return (
        <div className="global-artifact-viewer">
            <div className="artifact-list-panel">
                <div className="type-filter">
                    <select 
                        value={selectedType} 
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="type-select"
                    >
                        {types.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>
                <div className="artifacts-grid">
                    {filteredArtifacts.map(artifact => (
                        <div 
                            key={artifact.id} 
                            className={`artifact-card ${selectedArtifact?.id === artifact.id ? 'selected' : ''}`}
                            onClick={() => setSelectedArtifact(artifact)}
                        >
                            <div className="artifact-card-header">
                                <span className="artifact-type-badge">{artifact.type}</span>
                                <span className="artifact-id">#{artifact.id}</span>
                            </div>
                            <div className="artifact-card-title">
                                {artifact.metadata?.title || artifact.id}
                            </div>
                            <div className="artifact-card-meta">
                                {artifact.metadata?.tokenCount && (
                                    <span className="token-count">
                                        {artifact.metadata.tokenCount} tokens
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="artifact-detail-panel">
                {selectedArtifact ? (
                    <>
                        <div className="artifact-detail-header">
                            <h2>{selectedArtifact.metadata?.title || selectedArtifact.id}</h2>
                            <div className="artifact-meta">
                                <span className="artifact-type-badge">{selectedArtifact.type}</span>
                                <span className="artifact-id">#{selectedArtifact.id}</span>
                            </div>
                        </div>
                        <div className="artifact-content">
                            {typeof selectedArtifact.content === 'string' ? (
                                <pre>{selectedArtifact.content}</pre>
                            ) : Buffer.isBuffer(selectedArtifact.content) ? (
                                <pre>{selectedArtifact.content.toString('utf8')}</pre>
                            ) : (
                                <div>Binary content</div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="no-selection">
                        Select an artifact to view its details
                    </div>
                )}
            </div>
        </div>
    );
};
