import React, { useEffect, useState } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { useWebSocket } from '../contexts/DataContext';
import { ArtifactViewer } from './ArtifactViewer';
import { Box, Typography, List, ListItem, ListItemText, ListItemIcon, Drawer, IconButton, styled, useTheme, Divider } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

interface ArtifactPanelProps {
    channelId: string | null;
    threadId: string | null;
}

const DrawerHeader = styled('div')(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(0, 1),
    // necessary for content to be below app bar
    ...theme.mixins.toolbar,
    justifyContent: 'flex-start',
  }));
  

export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ channelId, threadId }) => {
    const { artifacts, fetchArtifacts } = useWebSocket();
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const theme = useTheme();
    
    useEffect(() => {
        let isSubscribed = true;

        const loadArtifacts = async () => {
            if (channelId && isSubscribed) {
                await fetchArtifacts(channelId, threadId);
            }
        };

        loadArtifacts();

        return () => {
            isSubscribed = false;
        };
    }, [channelId, threadId]);

    const handleArtifactClick = (artifact: Artifact) => {
        setSelectedArtifact(artifact);
        setDrawerOpen(true);
    };

    const handleDrawerClose = () => {
        setDrawerOpen(false);
    };
    

    return (
        <Box sx={{ p: 1, height: '100%', overflowY: 'auto' }}>
            
            <Divider />
            <List>
                {(artifacts || []).map((artifact: Artifact) => (
                    <ListItem
                        key={artifact.id}
                        button
                        onClick={() => handleArtifactClick(artifact)}
                    >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                            <FolderIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText
                            primary={artifact.metadata?.title || 'Untitled'}
                            secondary={`Type: ${artifact.type} | ID: ${artifact.id}`}
                            primaryTypographyProps={{ color: '#fff' }}
                            secondaryTypographyProps={{ color: '#666' }}
                        />
                        <ChevronRightIcon sx={{ color: '#666' }} />
                    </ListItem>
                ))}
            </List>

            <Drawer
                anchor="right"
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                PaperProps={{
                    sx: {
                        width: '40%'
                    }
                }}
            >
                <DrawerHeader/>
                {selectedArtifact && (
                    <Box sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <IconButton 
                                onClick={() => {
                                    const currentIndex = artifacts.findIndex(a => a.id === selectedArtifact.id);
                                    const prevArtifact = artifacts[currentIndex - 1];
                                    if (prevArtifact) {
                                        setSelectedArtifact(prevArtifact);
                                    }
                                }}
                                disabled={artifacts.findIndex(a => a.id === selectedArtifact.id) === 0}
                                sx={{ color: '#999' }}
                            >
                                <ChevronLeftIcon />
                            </IconButton>
                            <Typography variant="h6" noWrap sx={{ flexGrow: 1, textAlign: 'center' }} component="div">
                                {artifacts.findIndex(a => a.id === selectedArtifact.id) + 1} of {artifacts.length}
                            </Typography>
                            <IconButton 
                                onClick={() => {
                                    const currentIndex = artifacts.findIndex(a => a.id === selectedArtifact.id);
                                    const nextArtifact = artifacts[currentIndex + 1];
                                    if (nextArtifact) {
                                        setSelectedArtifact(nextArtifact);
                                    }
                                }}
                                disabled={artifacts.findIndex(a => a.id === selectedArtifact.id) === artifacts.length - 1}
                                sx={{ color: '#999' }}
                            >
                                <ChevronRightIcon />
                            </IconButton>
                            <IconButton onClick={() => setDrawerOpen(false)} sx={{ color: '#999' }}>
                                <ChevronRightIcon />
                            </IconButton>
                        </Box>
                        <ArtifactViewer
                            artifact={selectedArtifact}
                            onClose={() => setDrawerOpen(false)}
                        />
                    </Box>
                )}
            </Drawer>
        </Box>
    );
};
