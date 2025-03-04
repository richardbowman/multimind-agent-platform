import React, { useEffect, useMemo, useRef, useState } from 'react';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { Artifact } from '../../../../../tools/artifact';
import { Box, useTheme } from '@mui/material';
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
    const theme = useTheme();
    const [isMetadataExpanded, setIsMetadataExpanded] = useState(false);
    const artifactRef = useRef(artifact);
    const { registerActions, unregisterActions, updateActionState } = useToolbarActions();

    artifactRef.current = artifact;

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
                cursor: 'pointer'
            }}
            onClick={() => onSelect && onSelect(artifact, !isSelected)}
        >
            <Box 
                sx={{ 
                    p: 3,
                    borderBottom: 1,
                    borderColor: 'divider'
                }}
            >
                <Box 
                    component="h2" 
                    sx={{ 
                        mb: 1,
                        color: 'text.primary'
                    }}
                >
                    {artifact.metadata?.title || artifact.id}
                </Box>
                <Box 
                    sx={{ 
                        display: 'flex',
                        gap: 1,
                        alignItems: 'center'
                    }}
                >
                    <Box 
                        sx={{ 
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            bgcolor: 'primary.light',
                            color: 'primary.contrastText',
                            fontSize: '0.75rem',
                            fontWeight: 500
                        }}
                    >
                        {artifact.type}
                    </Box>
                    <Box 
                        component="span" 
                        sx={{ 
                            fontSize: '0.875rem',
                            color: 'text.secondary'
                        }}
                    >
                        #{artifact.id}
                    </Box>
                </Box>
            </Box>
            <Box 
                sx={{ 
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    flex: 1
                }}
            >
                {showMetadata && artifact.metadata && (
                    <Box 
                        sx={{ 
                            mb: 2,
                            borderBottom: 1,
                            borderColor: 'divider',
                            pb: 1
                        }}
                    >
                        <Box 
                            component="button"
                            onClick={() => setIsMetadataExpanded(!isMetadataExpanded)}
                            sx={{
                                background: 'none',
                                border: 'none',
                                color: 'text.secondary',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                py: 0.25,
                                fontSize: '0.875rem',
                                '&:hover': {
                                    color: 'text.primary'
                                }
                            }}
                        >
                            {isMetadataExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                            Metadata
                        </Box>
                        {isMetadataExpanded && (
                            <Box 
                                component="table" 
                                sx={{ 
                                    width: '100%',
                                    fontSize: '0.875rem',
                                    borderCollapse: 'collapse',
                                    mb: 2
                                }}
                            >
                                <Box component="tbody">
                                    {artifact.metadata && Object.entries(artifact.metadata)
                                        .filter(([key]) => key !== 'binary' && key !== 'format' && key !== 'title')
                                        .map(([key, value]) => (
                                            <Box 
                                                component="tr" 
                                                key={key} 
                                                sx={{ 
                                                    borderBottom: 1,
                                                    borderColor: 'divider'
                                                }}
                                            >
                                                <Box 
                                                    component="td" 
                                                    sx={{ 
                                                        p: '4px 8px',
                                                        fontWeight: 500,
                                                        color: 'text.secondary',
                                                        width: '30%'
                                                    }}
                                                >
                                                    {key}
                                                </Box>
                                                <Box 
                                                    component="td" 
                                                    sx={{ 
                                                        p: '4px 8px',
                                                        color: 'text.primary',
                                                        wordBreak: 'break-word'
                                                    }}
                                                >
                                                    {typeof value === 'object' ? JSON.stringify(value, null, 2) : 
                                                        (key.toLowerCase().includes('url') && typeof value === 'string' && value.startsWith('http') ? 
                                                            <Box 
                                                                component="a" 
                                                                href={value} 
                                                                target="_blank" 
                                                                rel="noopener noreferrer"
                                                                sx={{ 
                                                                    color: 'primary.main', 
                                                                    textDecoration: 'none',
                                                                    '&:hover': {
                                                                        textDecoration: 'underline'
                                                                    }
                                                                }}
                                                            >
                                                                {value}
                                                            </Box> : 
                                                            value
                                                        )
                                                    }
                                                </Box>
                                            </Box>
                                        ))
                                    }
                                </Box>
                            </Box>
                        )}
                    </Box>
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
