import React, { useState, useContext } from 'react';
import { Box } from '@mui/material';
import { CSVRenderer } from './CSVRenderer';
import { ActionToolbar } from './ActionToolbar';
import { Mermaid } from './Mermaid';
import ReactMarkdown from 'react-markdown';
import DescriptionIcon from '@mui/icons-material/Description';
import { DataContextMethods, useDataContext } from '../../contexts/DataContext';

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
        icon: React.ReactNode;
        label: string;
        onClick: () => void;
        disabled?: boolean;
    }>>([]);
    const dataContext = useDataContext();

    // Handle Markdown rendering
    if (language === 'markdown') {
        return (
            <Box sx={styles.container}>
                <ActionToolbar 
                    title={title || `Markdown Export - ${new Date().toLocaleDateString()}`}
                    actions={[{
                        icon: <DescriptionIcon />,
                        label: 'Save as Artifact',
                        onClick: async () => {
                            const artifactTitle = title || `Markdown Export - ${new Date().toLocaleDateString()}`;
                            if (dataContext) {
                                try {
                                    await dataContext.saveArtifact({
                                        id: crypto.randomUUID(),
                                        type: 'code',
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
                    }]}
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
                <Box sx={styles.contentContainerScrolling}>
                    {viewMode === 'visual' ? (
                        <ReactMarkdown
                            components={{
                                code: ({node, ...props}) => (
                                    <code style={{fontFamily: 'monospace', backgroundColor: '#f5f5f5', padding: '0.2em 0.4em', borderRadius: '4px'}} {...props} />
                                )
                            }}
                        >
                            {content}
                        </ReactMarkdown>
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
    }

    // Handle Mermaid diagrams
    if (language === 'mermaid') {
        return (
            <Box sx={styles.container}>
                <ActionToolbar 
                    title={title || `Mermaid Diagram - ${new Date().toLocaleDateString()}`}
                    actions={[{
                        icon: <DescriptionIcon />,
                        label: 'Save as Artifact',
                        onClick: async () => {
                            const artifactTitle = title || `Code Export - ${new Date().toLocaleDateString()}`;
                            if (dataContext) {
                                try {
                                    await dataContext.saveArtifact({
                                        id: crypto.randomUUID(),
                                        type: 'code',
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
                    }]}
                />
                <Box sx={styles.contentContainerFixed}>
                    <Mermaid content={content} />
                </Box>
            </Box>
        );
    }

    // Handle CSV rendering
    if (language === 'csv') {
        return (
            <Box sx={styles.container}>
                <ActionToolbar 
                    title={title || `CSV Export - ${new Date().toLocaleDateString()}`}
                    actions={[
                        ...toolbarActions,
                        {
                            icon: <DescriptionIcon />,
                            label: 'Save as Artifact',
                            onClick: async () => {
                            const artifactTitle = title || `Code Export - ${new Date().toLocaleDateString()}`;
                            if (dataContext) {
                                try {
                                    await dataContext.saveArtifact({
                                        id: crypto.randomUUID(),
                                        type: 'code',
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
                    }]}
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
                <Box sx={styles.contentContainerFixed}>
                    {viewMode === 'visual' ? (
                        <CSVRenderer 
                            content={content}
                            onAddToolbarActions={(actions) => {
                                // Add CSV save action to existing toolbar
                                setToolbarActions(prev => [
                                    ...prev.filter(a => a.label !== 'Save CSV'),
                                    ...actions
                                ]);
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
    }

    return (
        <Box sx={styles.container}>
            <ActionToolbar 
                title={title || `Code Export - ${new Date().toLocaleDateString()}`}
                actions={[{
                    icon: <DescriptionIcon />,
                    label: 'Save as Artifact',
                    onClick: () => {
                        console.log('Saving artifact:', content);
                    }
                }]}
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
            <Box sx={styles.contentContainerScrolling}>
                {viewMode === 'visual' ? (
                    <Box>
                        {content}
                    </Box>
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
