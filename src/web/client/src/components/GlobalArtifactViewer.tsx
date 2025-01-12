import React, { useEffect, useState } from 'react';
import { ArtifactDisplay } from './shared/ArtifactDisplay';
import { Artifact } from '../../../../tools/artifact';
import { useWebSocket } from '../contexts/DataContext';
import { Paper, Typography, Button, Box, Accordion, AccordionSummary, AccordionDetails, ListItemButton, IconButton, List, ListItemText, ListItem, ListItemIcon, Drawer, Toolbar, AppBar } from '@mui/material';
import Grid from '@mui/material/Grid2';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';
import MenuIcon from '@mui/icons-material/Menu';

export const GlobalArtifactViewer: React.FC = () => {
    const { artifacts, fetchAllArtifacts, deleteArtifact } = useWebSocket();
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
    const [artifactFolders, setArtifactFolders] = useState<Record<string, Artifact[]>>({});
    const [drawerOpen, setDrawerOpen] = useState(true);

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
        <Box sx={{ display: 'flex', height: 'calc(100vh - 48px)' }}>
            <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                <Toolbar>
                    <IconButton
                        color="inherit"
                        edge="start"
                        onClick={() => setDrawerOpen(!drawerOpen)}
                        sx={{ mr: 2 }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Typography variant="h6" noWrap component="div">
                        Artifact Viewer
                    </Typography>
                </Toolbar>
            </AppBar>
            <Drawer
                variant="persistent"
                anchor="left"
                open={drawerOpen}
                sx={{
                    width: 250,
                    flexShrink: 0,
                    '& .MuiDrawer-paper': {
                        width: 250,
                        boxSizing: 'border-box',
                        backgroundColor: '#2a2a2a',
                        borderRight: '1px solid #444'
                    },
                }}
            >
                <Toolbar /> {/* For spacing under app bar */}
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
            </Drawer>
            <Box component="main" sx={{ flexGrow: 1, p: 3, marginLeft: drawerOpen ? '250px' : 0, transition: 'margin 225ms cubic-bezier(0, 0, 0.2, 1) 0ms' }}>
                <Toolbar /> {/* For spacing under app bar */}
                {selectedArtifact ? (
                    <ArtifactDisplay artifact={selectedArtifact} showMetadata={true} />
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', fontStyle: 'italic' }}>
                        Select an artifact to view its details
                    </Box>
                )}
            </Box>
        </Box>
    );
};
