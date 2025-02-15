import React, { useState } from 'react';
import { Box } from '@mui/material';
import { ActionToolbar } from './ActionToolbar';
import DescriptionIcon from '@mui/icons-material/Description';
import { ContentRenderer } from './ContentRenderer';
import { useArtifacts } from '../../contexts/ArtifactContext';
import { createUUID } from '../../../../../types/uuid';
import { ArtifactType } from '../../../../../tools/artifact';

interface CodeBlockProps {
    language?: string;
    content: string;
    title?: string;
}

const viewOptions = [
    { value: 'visual', label: 'Visual' },
    { value: 'raw', label: 'Raw' }
];

const styles = {
    container: {
        mt: 2,
        mb: 2,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden'
    },
    contentContainerScrolling: {
        p: 2,
        bgcolor: 'background.paper',
        overflow: 'auto',
        maxHeight: '400px',
        '& pre': {
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word'
        }
    },
    contentContainerFixed: {
        bgcolor: 'background.paper',
        overflow: 'hidden',
        maxHeight: '400px',
        display: 'flex',
        flexDirection: 'column'
    },
    viewToggle: {
        display: 'flex',
        gap: 0.5,
        bgcolor: 'background.paper',
        borderRadius: 1,
        p: 0.5,
        borderBottom: '1px solid',
        borderColor: 'divider'
    },
    viewOption: {
        px: 1,
        py: 0.5,
        borderRadius: 0.5,
        cursor: 'pointer',
        '&:hover': {
            bgcolor: 'action.hover'
        }
    },
    activeViewOption: {
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        '&:hover': {
            bgcolor: 'primary.dark'
        }
    },
    textarea: {
        width: '100%',
        fontFamily: 'monospace',
        fontSize: '0.875rem',
        lineHeight: 1.5,
        minHeight: '200px',
        border: 'none',
        outline: 'none',
        resize: 'none'
    }
};

export const CodeBlock: React.FC<CodeBlockProps> = ({ language, content, title }) => {
    const [viewMode, setViewMode] = useState<'visual' | 'raw'>('visual');
    const [toolbarActions, setToolbarActions] = useState<Array<{
        icon?: React.ReactNode;
        label: string;
        onClick: () => void;
        disabled?: boolean;
        variant?: 'text' | 'outlined' | 'contained';
        color?: 'inherit' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';
    }>>([]);
    const artifactContext = useArtifacts();

    return (
        <Box sx={styles.container}>
            <ActionToolbar 
                title={title || `Generated Content`}
                actions={[
                    {
                        icon: <DescriptionIcon />,
                        label: 'Save as Artifact',
                        onClick: async () => {
                            const artifactTitle = title || `Content Export - ${new Date().toLocaleDateString()}`;
                            if (artifactContext) {
                                try {
                                    await artifactContext.saveArtifact({
                                        id: createUUID(),
                                        type: ArtifactType.Document,
                                        content: content,
                                        metadata: {
                                            language: language,
                                            title: artifactTitle
                                        }
                                    });
                                } catch (error) {
                                    console.error('Failed to save artifact:', error);
                                }
                            }
                        }
                    },
                    ...toolbarActions.map(action => ({
                        ...action,
                        // Ensure we have at least a default icon
                        icon: action.icon || <DescriptionIcon />
                    }))
                ]}
            />
            <Box sx={styles.viewToggle}>
                {viewOptions.map(option => (
                    <Box
                        key={option.value}
                        onClick={() => setViewMode(option.value as 'visual' | 'raw')}
                        sx={[
                            styles.viewOption,
                            viewMode === option.value && styles.activeViewOption
                        ]}
                    >
                        {option.label}
                    </Box>
                ))}
            </Box>
            <Box sx={{
                ...styles.contentContainerFixed,
                // Fixed height for Mermaid diagrams to prevent flickering
                ...(language === 'mermaid' && {
                    height: '400px',
                    overflow: 'hidden'
                })
            }}>
                {viewMode === 'visual' ? (
                    <ContentRenderer 
                        content={content}
                        type={language}
                        metadata={{
                            title: title,
                            language: language
                        }}
                        onAddToolbarActions={(actions) => {
                            setToolbarActions(actions);
                        }}
                    />
                ) : (
                    <Box 
                        component="textarea" 
                        value={content}
                        readOnly
                        sx={styles.textarea}
                    />
                )}
            </Box>
        </Box>
    );
};
