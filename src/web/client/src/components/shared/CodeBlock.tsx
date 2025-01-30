import React, { useState } from 'react';
import { Box } from '@mui/material';
import { CSVRenderer } from './CSVRenderer';
import { ActionToolbar } from './ActionToolbar';
import { Mermaid } from './Mermaid';
import DescriptionIcon from '@mui/icons-material/Description';

interface CodeBlockProps {
    language?: string;
    content: string;
    title?: string;
}

const viewOptions = [
    { value: 'visual', label: 'Visual' },
    { value: 'raw', label: 'Raw' }
];

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, content }) => {
    const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
    // Handle Mermaid diagrams
    if (language === 'mermaid') {
        return (
            <Box sx={{ 
                position: 'relative',
                mt: 2,
                mb: 2
            }}>
                <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1 }}>
                    <ActionToolbar 
                        actions={[
                            {
                                icon: <DescriptionIcon />,
                                label: 'Save as Artifact',
                                onClick: () => {
                                    // TODO: Implement save artifact functionality
                                    const artifactTitle = title || `Code Export - ${new Date().toLocaleDateString()}`;
                                    console.log('Saving artifact:', { title: artifactTitle, content });
                                }
                            }
                        ]}
                    />
                </Box>
                <Mermaid content={content} />
            </Box>
        );
    }

    // Handle CSV rendering
    if (language === 'csv') {
        return (
            <Box sx={{ 
                position: 'relative',
                mt: 2,
                mb: 2
            }}>
                <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, display: 'flex', gap: 1 }}>
                    <ActionToolbar 
                        actions={[
                            {
                                icon: <DescriptionIcon />,
                                label: 'Save as Artifact',
                                onClick: () => {
                                    // TODO: Implement save artifact functionality
                                    console.log('Saving artifact:', content);
                                }
                            }
                        ]}
                    />
                    <Box sx={{ 
                        display: 'flex',
                        gap: 0.5,
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                        p: 0.5,
                        border: '1px solid',
                        borderColor: 'divider'
                    }}>
                        {viewOptions.map(option => (
                            <Box
                                key={option.value}
                                onClick={() => setViewMode(option.value as 'visual' | 'raw')}
                                sx={{
                                    px: 1,
                                    py: 0.5,
                                    borderRadius: 0.5,
                                    cursor: 'pointer',
                                    bgcolor: viewMode === option.value ? 'primary.main' : 'transparent',
                                    color: viewMode === option.value ? 'primary.contrastText' : 'text.primary',
                                    '&:hover': {
                                        bgcolor: viewMode === option.value ? 'primary.dark' : 'action.hover'
                                    }
                                }}
                            >
                                {option.label}
                            </Box>
                        ))}
                    </Box>
                </Box>
                {viewMode === 'visual' ? (
                    <Box sx={{ 
                        mt: 2, 
                        mb: 2,
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        position: 'relative',
                        maxHeight: '300px', // Set max height
                        overflowY: 'auto' // Add vertical scrollbar if needed
                    }}>
                        <CSVRenderer content={content} />
                    </Box>
                ) : (
                    <Box component="textarea" 
                        value={content}
                        readOnly
                        sx={{ 
                            width: '100%',
                            p: 2,
                            bgcolor: 'background.paper',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1,
                            fontFamily: 'monospace',
                            fontSize: '0.875rem',
                            lineHeight: 1.5,
                            minHeight: '200px',
                            mt: 2,
                            mb: 2,
                            overflow: 'auto'
                        }}
                    />
                )}
            </Box>
        );
    }

    return (
        <Box sx={{ 
            position: 'relative',
            mt: 2,
            mb: 2
        }}>
            <Box sx={{ position: 'absolute', top: 8, right: 8, zIndex: 1, display: 'flex', gap: 1 }}>
                <ActionToolbar 
                    actions={[
                        {
                            icon: <DescriptionIcon />,
                            label: 'Save as Artifact',
                            onClick: () => {
                                // TODO: Implement save artifact functionality
                                console.log('Saving artifact:', content);
                            }
                        }
                    ]}
                />
                <Box sx={{ 
                    display: 'flex',
                    gap: 0.5,
                    bgcolor: 'background.paper',
                    borderRadius: 1,
                    p: 0.5,
                    border: '1px solid',
                    borderColor: 'divider'
                }}>
                    {viewOptions.map(option => (
                        <Box
                            key={option.value}
                            onClick={() => setViewMode(option.value as 'visual' | 'raw')}
                            sx={{
                                px: 1,
                                py: 0.5,
                                borderRadius: 0.5,
                                cursor: 'pointer',
                                bgcolor: viewMode === option.value ? 'primary.main' : 'transparent',
                                color: viewMode === option.value ? 'primary.contrastText' : 'text.primary',
                                '&:hover': {
                                    bgcolor: viewMode === option.value ? 'primary.dark' : 'action.hover'
                                }
                            }}
                        >
                            {option.label}
                        </Box>
                    ))}
                </Box>
            </Box>
            {viewMode === 'visual' ? (
                <Box component="pre" sx={{ 
                    p: 2, 
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    overflowX: 'auto',
                    pt: 6, // Add padding to prevent toolbar overlap
                    maxHeight: '300px', // Set max height
                    overflowY: 'auto' // Add vertical scrollbar if needed
                }}>
                    <code>
                        {content}
                    </code>
                </Box>
            ) : (
                <Box component="textarea" 
                    value={content}
                    readOnly
                    sx={{ 
                        width: '100%',
                        p: 2,
                        bgcolor: 'background.paper',
                        border: '1px solid',
                        borderColor: 'divider',
                        borderRadius: 1,
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                        lineHeight: 1.5,
                        minHeight: '200px',
                        mt: 2,
                        mb: 2,
                        overflow: 'auto'
                    }}
                />
            )}
        </Box>
    );
};
