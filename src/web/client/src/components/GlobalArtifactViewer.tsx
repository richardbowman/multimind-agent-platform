import React, { useEffect, useState } from 'react';
import { ArtifactDisplay } from './shared/ArtifactDisplay';
import { Artifact } from '../../../../tools/artifact';
import { useWebSocket } from '../contexts/DataContext';
import { Paper, Typography, Button, Box, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import Grid from '@mui/material/Grid2';

export const GlobalArtifactViewer: React.FC = () => {
    const { artifacts, fetchAllArtifacts, deleteArtifact } = useWebSocket();
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
    const [artifactFolders, setArtifactFolders] = useState<Record<string, Artifact[]>>({});

    useEffect(() => {
        fetchAllArtifacts();
    }, []);

    useEffect(() => {
        if (artifacts) {
            const folders = artifacts.reduce((acc, artifact) => {
                const type = artifact.type;
                if (!acc[type]) acc[type] = [];
                acc[type].push(artifact);
                return acc;
            }, {} as Record<string, Artifact[]>);
            setArtifactFolders(folders);
        }
    }, [artifacts]);

    return (
        <Grid container spacing={1} sx={{ height: 'calc(100vh - 48px)' }}>
            <Grid size={3} sx={{ p: 1, borderRight: '1px solid #444', overflowY: 'auto', height: '100%' }}>
                {Object.entries(artifactFolders).map(([type, artifacts]) => (
                    <Accordion key={type}>
                        <AccordionSummary sx={{ bgcolor: '#333', color: '#4a9eff', p: 0.5, borderRadius: 4 }}>
                            <Typography sx={{ fontSize: 0.9 }}>{type} ({artifacts.length})</Typography>
                        </AccordionSummary>
                        <AccordionDetails sx={{ p: 0.5 }}>
                            {artifacts.map(artifact => (
                                <Paper 
                                    key={artifact.id} 
                                    sx={{ 
                                        bgcolor: '#2a2a2a', 
                                        border: '1px solid #444', 
                                        borderRadius: 8, 
                                        p: 1, 
                                        cursor: 'pointer',
                                        mb: 0.5,
                                        ...(selectedArtifact?.id === artifact.id ? { borderColor: '#4a9eff', bgcolor: '#333' } : {})
                                    }}
                                    onClick={() => setSelectedArtifact(artifact)}
                                >
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <Typography sx={{ color: '#666', fontSize: 0.8 }}>#{artifact.id}</Typography>
                                            <Button 
                                                sx={{ 
                                                    bgcolor: 'none', 
                                                    border: 'none', 
                                                    color: '#ff4a4a', 
                                                    fontSize: 1.2, 
                                                    cursor: 'pointer', 
                                                    p: 0.2, 
                                                    borderRadius: 4, 
                                                    lineHeight: 1 
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm('Are you sure you want to delete this artifact?')) {
                                                        deleteArtifact(artifact.id);
                                                    }
                                                }}
                                            >
                                                ×
                                            </Button>
                                        </Box>
                                    </Box>
                                    <Typography sx={{ fontWeight: 500, mb: 0.5, color: '#fff' }}>
                                        {artifact.metadata?.title || artifact.id}
                                    </Typography>
                                </Paper>
                            ))}
                        </AccordionDetails>
                    </Accordion>
                ))}
            </Grid>
            <Grid size={9} sx={{ p: 1, height: '100%' }}>
                {selectedArtifact ? (
                    <ArtifactDisplay artifact={selectedArtifact} showMetadata={true} />
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', fontStyle: 'italic' }}>
                        Select an artifact to view its details
                    </Box>
                )}
            </Grid>
        </Grid>
    );
};
