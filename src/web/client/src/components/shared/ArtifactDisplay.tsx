import React, { useEffect, useMemo, useRef, useState } from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { Artifact } from '../../../../../tools/artifact';
import { Box } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import DownloadIcon from '@mui/icons-material/Download';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { ContentRenderer } from './ContentRenderer';
import { useToolbarActions } from '../../contexts/ToolbarActionsContext';

interface ArtifactDisplayProps {
    artifact: Artifact;
    showMetadata?: boolean;
    onDelete?: (artifact: Artifact) => void;
    onEdit?: (artifact: Artifact) => void;
    isSelected?: boolean;
    onSelect?: (artifact: Artifact, selected: boolean) => void;
}

export const ArtifactDisplay: React.FC<ArtifactDisplayProps> = ({
    artifact,
    showMetadata = true,
    onDelete,
    onEdit,
    isSelected = false,
    onSelect
}) => {
    const [isMetadataExpanded, setIsMetadataExpanded] = useState(false);
    const { addActions } = useToolbarActions();
    const handleExport = () => {
        let fileContent = '';
        // Clean the filename by removing any existing extensions
        let fileName = (artifact.metadata?.title || 'artifact').replace(/\.[^/.]+$/, "");
        let mimeType = 'text/plain';

        // Handle different content types
        if (artifact.metadata?.mimeType?.startsWith('image/')) {
            let binaryData;
            if (typeof artifact.content === 'string') {
                if (artifact.content.startsWith('data:')) {
                    // Extract base64 data from data URL
                    binaryData = atob(artifact.content.split(',')[1]);
                } else {
                    // Assume it's already base64
                    binaryData = atob(artifact.content);
                }
            } else if (artifact.content instanceof ArrayBuffer) {
                binaryData = String.fromCharCode(...new Uint8Array(artifact.content));
            } else if (artifact.content instanceof Uint8Array) {
                binaryData = String.fromCharCode(...artifact.content);
            } else {
                throw new Error('Unsupported image content type');
            }
            
            // Convert binary string to Uint8Array
            const bytes = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
                bytes[i] = binaryData.charCodeAt(i);
            }
            
            fileContent = bytes;
            mimeType = artifact.metadata.mimeType;
            fileName = `${fileName}.${mimeType.split('/')[1]}`;
        } else if (artifact.type === 'csv' || artifact.metadata?.mimeType === 'text/csv') {
            fileContent = artifact.content as string;
            fileName += '.csv';
            mimeType = 'text/csv';
        } else {
            fileContent = artifact.content as string;
            fileName += '.md';
        }

        // Create blob and download
        const blob = new Blob([fileContent], { type: mimeType });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    };

    const artifactRef = useRef(artifact);
    artifactRef.current = artifact;

    const baseActions = useMemo(() => [
        {
            id: 'artifact-display-edit',
            icon: <EditIcon fontSize="small" />,
            label: 'Edit Artifact',
            onClick: () => onEdit && onEdit(artifactRef.current)
        },
        {
            id: 'artifact-display-delete', 
            icon: <DeleteIcon fontSize="small" />,
            label: 'Delete Artifact',
            onClick: () => onDelete && onDelete(artifactRef.current)
        },
        {
            id: 'artifact-display-export',
            icon: <DownloadIcon fontSize="small" />,
            label: 'Export Artifact',
            onClick: handleExport
        }
    ], [onEdit, onDelete, handleExport]);

    const { registerActions, unregisterActions, updateActionState } = useToolbarActions();

    useEffect(() => {
        registerActions('artifact-display', baseActions);
        return () => unregisterActions('artifact-display');
    }, [registerActions, unregisterActions]);

    // Update action states based on props
    useEffect(() => {
        updateActionState('artifact-display-edit', { disabled: !onEdit });
        updateActionState('artifact-display-delete', { disabled: !onDelete });
    }, [onEdit, onDelete, updateActionState]);

    return (
        <Box 
            component="main" 
            sx={{ 
                flexGrow: 1, 
                display: 'flex',
                flexDirection: "column",
                flex: 1,
                position: 'relative',
                overflow: 'hidden',
                cursor: 'pointer',
                padding: '8px'
            }}
            onClick={() => onSelect && onSelect(artifact, !isSelected)}
        >
            <div className="artifact-detail-header">
                <h2>{artifact.metadata?.title || artifact.id}</h2>
                <div className="artifact-meta">
                    <span className="artifact-type-badge">{artifact.type}</span>
                    <span className="artifact-id">#{artifact.id}</span>
                </div>
            </div>
            <div className="artifact-content" style={{display: "flex", flexDirection:"column", overflow: "hidden"}}>
                {showMetadata && artifact.metadata && (
                    <div style={{ 
                        marginBottom: '1rem',
                        borderBottom: '1px solid #444',
                        paddingBottom: '0.5rem'
                    }}>
                        <button 
                            onClick={() => setIsMetadataExpanded(!isMetadataExpanded)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: '#aaa',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.25rem 0',
                                fontSize: '0.875rem'
                            }}
                        >
                            {isMetadataExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                            Metadata
                        </button>
                        {isMetadataExpanded && (
                    <table style={{ 
                        width: '100%',
                        fontSize: '0.875rem',
                        borderCollapse: 'collapse',
                        marginBottom: '1rem'
                    }}>
                        <tbody>
                            {artifact.metadata && Object.entries(artifact.metadata)
                                .filter(([key]) => key !== 'binary' && key !== 'format' && key !== 'title')
                                .map(([key, value]) => (
                                    <tr key={key} style={{ borderBottom: '1px solid #444' }}>
                                        <td style={{ 
                                            padding: '4px 8px',
                                            fontWeight: 500,
                                            color: '#aaa',
                                            width: '30%'
                                        }}>{key}</td>
                                        <td style={{ 
                                            padding: '4px 8px',
                                            color: '#ddd',
                                            wordBreak: 'break-word'
                                        }}>
                                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : 
                                                (key.toLowerCase().includes('url') && typeof value === 'string' && value.startsWith('http') ? 
                                                    <a 
                                                        href={value} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        style={{ color: '#90caf9', textDecoration: 'none' }}
                                                    >
                                                        {value}
                                                    </a> : 
                                                    value
                                                )
                                            }
                                        </td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                        )}
                    </div>
                )}
                <ContentRenderer 
                    content={artifact.content}
                    type={artifact.type}
                    metadata={artifact.metadata}
                />
            </div>
        </Box>
    );
};
