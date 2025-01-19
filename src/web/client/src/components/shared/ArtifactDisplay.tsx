import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Artifact } from '../../../../../tools/artifact';
import remarkGfm from 'remark-gfm'
import { Box, Button, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';

interface ArtifactDisplayProps {
    artifact: Artifact;
    showMetadata?: boolean;
    onDelete?: () => void;
    onEdit?: () => void;
}

export const ArtifactDisplay: React.FC<ArtifactDisplayProps> = ({
    artifact,
    showMetadata = true,
    onDelete
}) => {
    return (
        <Box component="main" sx={{ 
            flexGrow: 1, 
            display: 'flex',
            flexDirection: "column",
            flex: 1,
            overflow: 'hidden',
            position: 'relative'
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
            <div className="artifact-content">
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
                {artifact.type === 'binary' || artifact.metadata?.format === 'binary' ? (
                    <pre>{artifact.content as string}</pre>
                ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content as string}</ReactMarkdown>
                )}
            </div>
        </Box>
    );
};
