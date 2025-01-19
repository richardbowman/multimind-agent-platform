import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Artifact } from '../../../../../tools/artifact';
import remarkGfm from 'remark-gfm'
import { Box, Button, Typography } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

interface ArtifactDisplayProps {
    artifact: Artifact;
    showMetadata?: boolean;
    onDelete?: () => void;
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
            <Box sx={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 2
            }}>
                <Box>
                    <Typography variant="h5" component="h2">
                        {artifact.metadata?.title || artifact.id}
                    </Typography>
                    <Box sx={{ 
                        display: 'flex', 
                        gap: 1, 
                        mt: 0.5,
                        alignItems: 'center'
                    }}>
                        <Box sx={{ 
                            px: 1,
                            py: 0.5,
                            borderRadius: 1,
                            backgroundColor: 'rgba(255, 255, 255, 0.1)',
                            fontSize: '0.75rem',
                            fontWeight: 500
                        }}>
                            {artifact.type}
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                            #{artifact.id}
                        </Typography>
                    </Box>
                </Box>
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
