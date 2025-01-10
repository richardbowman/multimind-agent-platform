import React, { useEffect, useState } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { useWebSocket } from '../contexts/DataContext';
import { ArtifactViewer } from './ArtifactViewer';
import { Box, Typography, List, ListItem, ListItemText, ListItemIcon, Drawer, IconButton } from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

interface ArtifactPanelProps {
    channelId: string | null;
    threadId: string | null;
}

export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ channelId, threadId }) => {
    const { artifacts, fetchArtifacts } = useWebSocket();
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

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

    return (
        <Box sx={{ p: 1, height: '100%', overflowY: 'auto' }}>
            <Typography variant="h2" sx={{ mb: 1, color: '#999', textTransform: 'uppercase' }}>
                Artifacts
            </Typography>
            <List>
                {(artifacts || []).map((artifact: Artifact) => (
                    <ListItem 
                        key={artifact.id}
                        button
                        onClick={() => handleArtifactClick(artifact)}
                        sx={{
                            borderBottom: '1px solid #444',
                            '&:hover': {
                                backgroundColor: '#333'
                            }
                        }}
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
                        width: '40%',
                        bgcolor: '#2a2a2a',
                        borderLeft: '1px solid #444'
                    }
                }}
            >
                {selectedArtifact && (
                    <Box sx={{ p: 2 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
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
