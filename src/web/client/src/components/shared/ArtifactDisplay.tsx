import React, { useEffect, useMemo } from 'react';
import { Artifact } from '../../../../../tools/artifact';
import { Box } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import DownloadIcon from '@mui/icons-material/Download';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { ContentRenderer } from './ContentRenderer';

interface ArtifactDisplayProps {
    artifact: Artifact;
    showMetadata?: boolean;
    onDelete?: () => void;
    onEdit?: () => void;
}

export const ArtifactDisplay: React.FC<ArtifactDisplayProps & { onAddToolbarActions?: (actions: Array<{
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    disabled?: boolean;
}>) => void }> = ({
    artifact,
    showMetadata = true,
    onDelete,
    onEdit,
    onAddToolbarActions
}) => {
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

    const baseActions = useMemo(() => [
        {
            icon: <EditIcon fontSize="small" />,
            label: 'Edit Artifact',
            onClick: () => onEdit && onEdit()
        },
        {
            icon: <DeleteIcon fontSize="small" />,
            label: 'Delete Artifact',
            onClick: () => onDelete && onDelete()
        },
        {
            icon: <DownloadIcon fontSize="small" />,
            label: 'Export Artifact',
            onClick: handleExport
        }
    ], [onEdit, onDelete]);

    useEffect(() => {
        if (onAddToolbarActions && artifact) {
            // Get any additional actions from the content renderer
            const additionalActions = onAddToolbarActions([]) || [];
            
            // Combine actions, ensuring base actions are always present
            const combinedActions = [
                ...baseActions,
                ...additionalActions.filter(action => 
                    !baseActions.some(base => base.label === action.label)
                )
            ];
            
            onAddToolbarActions(combinedActions);
        }
    }, [artifact.id, baseActions, onAddToolbarActions]); // Update when these dependencies change
    return (
        <Box component="main" sx={{ 
            flexGrow: 1, 
            display: 'flex',
            flexDirection: "column",
            flex: 1,
            position: 'relative',
            height: (artifact.metadata?.format === 'csv' || artifact.type === 'csv') ? '100%': undefined
        }}>
            <div className="artifact-detail-header">
                <h2>{artifact.metadata?.title || artifact.id}</h2>
                <div className="artifact-meta">
                    <span className="artifact-type-badge">{artifact.type}</span>
                    <span className="artifact-id">#{artifact.id}</span>
                </div>
            </div>
            <div className="artifact-content" style={{display: "flex", flexDirection:"column", overflow: "hidden"}}>
                {showMetadata && (
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
                                            {typeof value === 'object' ? JSON.stringify(value, null, 2) : value}
                                        </td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                )}
                <ContentRenderer 
                    content={artifact.content}
                    type={artifact.type}
                    metadata={artifact.metadata}
                    onAddToolbarActions={onAddToolbarActions}
                />
            </div>
        </Box>
    );
};
