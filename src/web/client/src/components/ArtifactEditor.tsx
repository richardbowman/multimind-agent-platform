import React, { useState } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { Button, TextField, Select, MenuItem, Box, Dialog, DialogTitle, DialogContent, DialogActions, Typography } from '@mui/material';
import { useWebSocket } from '../contexts/DataContext';
import { useIPCService } from '../contexts/IPCContext';

interface ArtifactEditorProps {
    open: boolean;
    onClose: () => void;
    onCreate: (artifact: Artifact) => void;
}

export const ArtifactEditor: React.FC<ArtifactEditorProps> = ({ open, onClose, onCreate }) => {
    const [artifactType, setArtifactType] = useState('text');
    const [artifactContent, setArtifactContent] = useState('');
    const [title, setTitle] = useState('');
    const [metadata, setMetadata] = useState('{}');

    const { saveArtifact } = useWebSocket();

    const handleCreate = async () => {
        try {
            const metadataObj = JSON.parse(metadata);
            if (title) {
                metadataObj.title = title;
            }
            
            const newArtifact: Artifact = {
                id: crypto.randomUUID(),
                type: artifactType,
                content: artifactContent,
                metadata: metadataObj
            };
            
            await saveArtifact(newArtifact);
            onCreate(newArtifact);
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
            <DialogTitle>Create New Artifact</DialogTitle>
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
