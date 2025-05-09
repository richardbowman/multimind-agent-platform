import React, { useEffect, useState } from 'react';
import { Artifact, ArtifactType } from '../../../../tools/artifact';
import { Button, TextField, Select, MenuItem, Box, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import { createUUID } from '../../../../types/uuid';
import { useArtifacts } from '../contexts/ArtifactContext';

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
    const [artifactType, setArtifactType] = useState(ArtifactType.Document);
    const [artifactContent, setArtifactContent] = useState('');
    const [title, setTitle] = useState('');
    const [metadata, setMetadata] = useState('{}');

    // Initialize form when artifact prop changes
    useEffect(() => {
        if (artifact) {
            setArtifactType(artifact.type);
            setArtifactContent(artifact.content?.toString());
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

    const { saveArtifact } = useArtifacts();

    const handleCreate = async () => {
        try {
            const metadataObj = JSON.parse(metadata);
            if (title) {
                metadataObj.title = title;
            }
            
            const newArtifact: Artifact = {
                id: artifact?.id,
                type: artifactType,
                content: artifactContent,
                metadata: metadataObj
            };
            
            const savedArtifact = await saveArtifact(newArtifact);
            
            if (artifact) {
                // Only call onUpdate if we're editing an existing artifact
                onUpdate?.(savedArtifact);
            } else {
                // Call onCreate for new artifacts
                onCreate(savedArtifact);
            }
            
            onClose();
            resetForm();
            return savedArtifact;
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
                        <MenuItem value={ArtifactType.Document}>Document</MenuItem>
                        <MenuItem value={ArtifactType.Spreadsheet}>Spreadsheet</MenuItem>
                        <MenuItem value={ArtifactType.Webpage}>Webpage</MenuItem>
                        <MenuItem value={ArtifactType.Diagram}>Diagram</MenuItem>
                        <MenuItem value={ArtifactType.Calendar}>Calendar</MenuItem>
                        <MenuItem value={ArtifactType.ProcedureGuide}>Procedure Guide</MenuItem>
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
                    {artifact ? 'Save Changes' : 'Create Artifact'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};
