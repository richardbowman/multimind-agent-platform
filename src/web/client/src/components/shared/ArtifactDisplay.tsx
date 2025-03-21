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
import { ActionToolbar } from './ActionToolbar';

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
    const isMetadataExpanded = useRef(false);
    const artifactRef = useRef(artifact);
    const { actions: toolbarActions, registerActions, unregisterActions, updateActionState } = useToolbarActions();

    artifactRef.current = artifact;

    const handleExport = () => {
        let fileContent = '';
        // Clean the filename by removing any existing extensions
        let fileName = (artifact.metadata?.title || 'artifact').replace(/\.[^/.]+$/, "");
        let mimeType = 'text/plain';

        // Handle different content types
        if (artifact.metadata?.mimeType?.startsWith('image/') || 
            artifact.metadata?.mimeType === 'application/pdf') {
            let binaryData;
            if (typeof artifact.content === 'string') {
                if (artifact.content.startsWith('data:')) {
                    // Extract base64 data from data URL
                    const base64Data = artifact.content.split(',')[1];
                    binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                } else {
                    // Assume it's already base64
                    binaryData = Uint8Array.from(atob(artifact.content), c => c.charCodeAt(0));
                }
            } else if (artifact.content instanceof ArrayBuffer) {
                binaryData = new Uint8Array(artifact.content);
            } else if (artifact.content instanceof Uint8Array) {
                binaryData = artifact.content;
            } else {
                throw new Error('Unsupported binary content type');
            }
            
            fileContent = binaryData;
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

    const handleMetadataToggle = () => {
        const newState = !isMetadataExpanded.current;
        isMetadataExpanded.current = newState;
        updateActionState('artifact-display-metadata', {
            icon: newState ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />,
            label: newState ? 'Collapse Metadata' : 'Expand Metadata'                
        })
    };


    const baseActions = useMemo(() => [
        {
            id: 'artifact-display-metadata',
            icon: isMetadataExpanded.current ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />,
            label: isMetadataExpanded.current ? 'Collapse Metadata' : 'Expand Metadata',
            onClick: handleMetadataToggle
        },
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
            onClick: async () => {
                if (onDelete) {
                    await onDelete(artifactRef.current);
                    // Clear selection after deletion
                    if (onSelect) {
                        onSelect(artifactRef.current, false);
                    }
                }
            }
        },
        {
            id: 'artifact-display-export',
            icon: <DownloadIcon fontSize="small" />,
            label: 'Export Artifact',
            onClick: handleExport
        }
    ], [onEdit, onDelete, handleExport, handleMetadataToggle, updateActionState]);


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
        >
                    <Box
                        sx={{
                            p: 1,
                            borderBottom: 1,
                            borderColor: 'divider'
                        }}
                    >
                        <Box
                            component="h3"
                            sx={{
                                color: 'text.primary'
                            }}
                        >
                            {artifact?.metadata?.title || artifact?.id}
                        </Box>
                    </Box>
                    <ActionToolbar actions={toolbarActions} />

            <Box 
                sx={{ 
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    flex: 1
                }}
            >
                {showMetadata && artifact.metadata && isMetadataExpanded.current && (
                    <Box 
                        sx={{ 
                            mb: 2,
                            borderBottom: 1,
                            borderColor: 'divider',
                            pb: 1
                        }}
                    >
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
                                {[
                                    ['Type', artifact.type],
                                    ['ID', artifact.id],
                                    ...Object.entries(artifact.metadata || {})
                                ]
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
                    </Box>
                )}
                <ContentRenderer 
                    artifact={artifact}
                    content={artifact.content}
                    type={artifact.type}
                    metadata={artifact.metadata}
                />
            </Box>
        </Box>
    );
};
