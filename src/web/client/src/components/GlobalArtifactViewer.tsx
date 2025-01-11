import React, { useEffect, useState } from 'react';
import { ArtifactDisplay } from './shared/ArtifactDisplay';
import { Artifact } from '../../../../tools/artifact';
import { useWebSocket } from '../contexts/DataContext';
import { Paper, Typography, Button, Box, Accordion, AccordionSummary, AccordionDetails, ListItemButton, IconButton, List, ListItemText, ListItem, ListItemIcon } from '@mui/material';
import Grid from '@mui/material/Grid2';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';

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
            <Grid size={3}>
                {Object.entries(artifactFolders).map(([type, artifacts]) => (
                    <Accordion key={type}>
                        <AccordionSummary>
                            <Typography>{type} ({artifacts.length})</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <List>
                                {artifacts.map(artifact => (
                                    <ListItem
                                        key={artifact.id}
                                        selected={selectedArtifact?.id === artifact.id}
                                        onClick={() => setSelectedArtifact(artifact)}
                                        secondaryAction={
                                            <IconButton edge="end" aria-label="delete" onClick={(e) => {
                                                e.stopPropagation();
                                                if (window.confirm('Are you sure you want to delete this artifact?')) {
                                                    deleteArtifact(artifact.id);
                                                }
                                            }}>
                                                <DeleteIcon />
                                            </IconButton>
                                        }
                                    >
                                        <ListItemIcon>
                                            <FolderIcon />
                                        </ListItemIcon>
                                        <ListItemText primary={artifact.metadata?.title || artifact.id} />

                                    </ListItem>
                                ))}
                            </List>
                        </AccordionDetails>
                    </Accordion>
                ))}
            </Grid>
            <Grid size={9}>
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
