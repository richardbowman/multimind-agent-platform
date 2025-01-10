import React, { useEffect, useState } from 'react';
import { ArtifactDisplay } from './shared/ArtifactDisplay';
import { Artifact } from '../../../../tools/artifact';
import { useWebSocket } from '../contexts/DataContext';

export const GlobalArtifactViewer: React.FC = () => {
    const { artifacts, fetchAllArtifacts, deleteArtifact } = useWebSocket();
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
                                <div className="artifact-card-actions">
                                    <span className="artifact-id">#{artifact.id}</span>
                                    <button 
                                        className="delete-artifact-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (window.confirm('Are you sure you want to delete this artifact?')) {
                                                deleteArtifact(artifact.id);
                                            }
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>
                            <div className="artifact-card-title">
                                {artifact.metadata?.title || artifact.id}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="artifact-detail-panel">
                {selectedArtifact ? (
                    <ArtifactDisplay artifact={selectedArtifact} showMetadata={true} />
                ) : (
                    <div className="no-selection">
                        Select an artifact to view its details
                    </div>
                )}
            </div>
        </div>
    );
};
