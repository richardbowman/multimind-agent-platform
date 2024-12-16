import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Artifact } from '../../../../../tools/artifact';

interface ArtifactDisplayProps {
    artifact: Artifact;
    showMetadata?: boolean;
}

export const ArtifactDisplay: React.FC<ArtifactDisplayProps> = ({ 
    artifact,
    showMetadata = true 
}) => {
    return (
        <div className="artifact-detail-content">
            <div className="artifact-detail-header">
                <h2>{artifact.metadata?.title || artifact.id}</h2>
                <div className="artifact-meta">
                    <span className="artifact-type-badge">{artifact.type}</span>
                    <span className="artifact-id">#{artifact.id}</span>
                </div>
            </div>
            {showMetadata && (
                <div className="artifact-metadata-card">
                    <table className="metadata-table">
                        <tbody>
                            {artifact.metadata && Object.entries(artifact.metadata)
                                .filter(([key]) => key !== 'binary' && key !== 'format' && key !== 'title')
                                .map(([key, value]) => (
                                    <tr key={key} className="metadata-row">
                                        <td className="metadata-label">{key}</td>
                                        <td className="metadata-value">
                                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : value}
                                        </td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                </div>
            )}
            <div className="artifact-content">
                {artifact.type === 'binary' || artifact.metadata?.format === 'binary' ? (
                    <pre>{artifact.content as string}</pre>
                ) : (
                    <ReactMarkdown>{artifact.content as string}</ReactMarkdown>
                )}
            </div>
        </div>
    );
};
