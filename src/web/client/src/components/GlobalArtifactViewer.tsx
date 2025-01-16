import React, { useEffect, useState } from 'react';
import { ArtifactDisplay } from './shared/ArtifactDisplay';
import { Artifact } from '../../../../tools/artifact';
import { useWebSocket } from '../contexts/DataContext';
import { Paper, Typography, Button, Box, Accordion, AccordionSummary, AccordionDetails, IconButton, List, Drawer, Toolbar, Fab } from '@mui/material';
import { ArtifactCard } from './ArtifactCard';
import Grid from '@mui/material/Grid2';
import DeleteIcon from '@mui/icons-material/Delete';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import MenuIcon from '@mui/icons-material/Menu';

export interface DrawerPage {
    drawerOpen: boolean;
    onDrawerToggle: () => void;
}

export const GlobalArtifactViewer: React.FC<DrawerPage> = ({ drawerOpen, onDrawerToggle }) => {
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
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
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
                            <FolderIcon sx={{ mr: 1 }} />
                            <Typography>{type} ({artifacts.length})</Typography>
                        </AccordionSummary>
                        <AccordionDetails>
                            <List>
                                {artifacts.map(artifact => (
                                    <ArtifactCard
                                        key={artifact.id}
                                        artifact={artifact}
                                        selected={selectedArtifact?.id === artifact.id}
                                        onClick={() => setSelectedArtifact(artifact)}
                                    />
                                ))}
                            </List>
                        </AccordionDetails>
                    </Accordion>
                ))}
            </Drawer>
            <Box component="main" sx={{ 
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                marginLeft: drawerOpen ? 0 : '-250px', 
                transition: 'margin 225ms cubic-bezier(0, 0, 0.2, 1) 0ms',
                flex: 1,
                overflow: 'hidden',
                position: 'relative'
            }}>
                {selectedArtifact ? (
                    <ArtifactDisplay artifact={selectedArtifact} showMetadata={true} />
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', overflow: 'hidden', justifyContent: 'center', flex:1, color: '#666', fontStyle: 'italic' }}>
                        Select an artifact to view its details
                    </Box>
                )}
            </Box>
        </Box>
    );
};
