import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Artifact } from '../../../../../tools/artifact';
import remarkGfm from 'remark-gfm'
import { Box, Button, Typography, Paper } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { CSVRenderer } from './CSVRenderer';

interface ArtifactDisplayProps {
    artifact: Artifact;
    showMetadata?: boolean;
    onDelete?: () => void;
    onEdit?: () => void;
}

export const ArtifactDisplay: React.FC<ArtifactDisplayProps> = ({
    artifact,
    showMetadata = true,
    onDelete,
    onEdit
}) => {
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
                <Box sx={{ display: 'flex', gap: 1, ml: 2 }}>
                    <Button 
                        variant="outlined" 
                        color="primary" 
                        size="small"
                        startIcon={<EditIcon fontSize="small" />}
                        onClick={() => onEdit && onEdit()}
                    >
                        Edit
                    </Button>
                    <Button 
                        variant="outlined" 
                        color="error" 
                        size="small"
                        startIcon={<DeleteIcon fontSize="small" />}
                        onClick={() => onDelete && onDelete()}
                    >
                        Delete
                    </Button>
                </Box>
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
                {(() => {
                    // Handle CSV content
                    if (artifact.metadata?.format === 'csv' || artifact.type === 'csv') {
                        return <CSVRenderer content={artifact.content as string} />;
                    }
                    
                    // Handle image content
                    if (artifact.metadata?.mimeType?.startsWith('image/')) {
                        // Handle base64 content directly if it's already in that format
                        const base64Content = typeof artifact.content === 'string' 
                            ? artifact.content.replace(/^data:image\/\w+;base64,/, '') // Strip existing data URL prefix if present
                            : btoa(String.fromCharCode(...new Uint8Array(artifact.content as ArrayBuffer))); // Convert binary to base64
                        
                        const dataUrl = `data:${artifact.metadata?.mimeType};base64,${base64Content}`;
                        
                        return (
                            <Box sx={{ 
                                display: 'flex', 
                                justifyContent: 'center', 
                                alignItems: 'center',
                                p: 2 
                            }}>
                                <Paper elevation={3} sx={{ p: 1, maxWidth: '100%', maxHeight: '70vh' }}>
                                    <img 
                                        src={dataUrl} 
                                        alt={artifact.metadata?.title || 'Image artifact'} 
                                        style={{ 
                                            maxWidth: '100%', 
                                            maxHeight: '70vh',
                                            objectFit: 'contain'
                                        }}
                                    />
                                </Paper>
                            </Box>
                        );
                    }
                    
                    // Handle binary content
                    if (artifact.type === 'binary' || artifact.metadata?.format === 'binary') {
                        return <pre>{artifact.content as string}</pre>;
                    }
                    
                    // Default to Markdown rendering
                    return <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content as string}</ReactMarkdown>;
                })()}
            </div>
        </Box>
    );
};
