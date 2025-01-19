import React, { useState } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { Button, TextField, Select, MenuItem, Box, Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@mui/material';
import { useWebSocket } from '../contexts/DataContext';
import { useIPCService } from '../contexts/IPCContext';

interface ArtifactEditorProps {
    open: boolean;
    onClose: () => void;
    onCreate: (artifact: Artifact) => void;
    onUpdate?: (artifact: Artifact) => void;
    artifact?: Artifact;
}

export const ArtifactEditor: React.FC<ArtifactEditorProps> = ({ 
    open, 
    onClose, 
    onCreate, 
    onUpdate, 
    artifact 
}) => {
    const [artifactType, setArtifactType] = useState('text');
    const [artifactContent, setArtifactContent] = useState('');
    const [title, setTitle] = useState('');
    const [metadata, setMetadata] = useState('{}');

    // Initialize form when artifact prop changes
    useEffect(() => {
        if (artifact) {
            setArtifactType(artifact.type);
            setArtifactContent(artifact.content);
            setTitle(artifact.metadata?.title || '');
            setMetadata(
                JSON.stringify(
                    Object.fromEntries(
                        Object.entries(artifact.metadata || {})
                            .filter(([key]) => key !== 'title')
                    ), 
                    null, 2
                )
            );
        } else {
            // Reset form for new artifact
            setArtifactType('text');
            setArtifactContent('');
            setTitle('');
            setMetadata('{}');
        }
    }, [artifact]);

    const { saveArtifact } = useWebSocket();

    const handleCreate = async () => {
        try {
            const metadataObj = JSON.parse(metadata);
            if (title) {
                metadataObj.title = title;
            }
            
            const artifact: Artifact = {
                id: artifact?.id || crypto.randomUUID(),
                type: artifactType,
                content: artifactContent,
                metadata: metadataObj
            };
            
            await saveArtifact(artifact);
            
            if (artifact) {
                onUpdate?.(artifact);
            } else {
                onCreate(artifact);
            }
            onClose();
            resetForm();
        } catch (error) {
            console.error('Error creating artifact:', error);
        }
    };

    const resetForm = () => {
        setArtifactType('text');
        setArtifactContent('');
        setMetadata('{}');
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>{artifact ? 'Edit Artifact' : 'Create New Artifact'}</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                    <TextField
                        label="Title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        fullWidth
                        variant="outlined"
                        sx={{ mb: 2 }}
                    />
                    <Select
                        value={artifactType}
                        onChange={(e) => setArtifactType(e.target.value as string)}
                        label="Artifact Type"
                        fullWidth
                    >
                        <MenuItem value="text">Text</MenuItem>
                        <MenuItem value="code">Code</MenuItem>
                        <MenuItem value="report">Report</MenuItem>
                        <MenuItem value="document">Document</MenuItem>
                        <MenuItem value="image">Image</MenuItem>
                    </Select>

                    <TextField
                        label="Content"
                        multiline
                        rows={6}
                        value={artifactContent}
                        onChange={(e) => setArtifactContent(e.target.value)}
                        fullWidth
                        variant="outlined"
                    />

                    <TextField
                        label="Metadata (JSON)"
                        multiline
                        rows={3}
                        value={metadata}
                        onChange={(e) => setMetadata(e.target.value)}
                        fullWidth
                        variant="outlined"
                        helperText="Enter valid JSON metadata"
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button 
                    onClick={handleCreate} 
                    variant="contained" 
                    color="primary"
                    disabled={!artifactContent || !artifactType || !title}
                >
                    Create Artifact
                </Button>
            </DialogActions>
        </Dialog>
    );
};
