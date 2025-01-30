import React, { useEffect, useRef, useState } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { useDataContext } from '../contexts/DataContext';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import { ArtifactDisplay } from './shared/ArtifactDisplay';
import { ActionToolbar } from './shared/ActionToolbar';
import { Box, Typography, List, Drawer, styled, useTheme, Divider, IconButton, Button } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import { ArtifactCard } from './ArtifactCard';

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
    const { 
        currentThreadArtifacts: artifacts, 
        currentChannelId,
        addArtifactToChannel,
        removeArtifactFromChannel 
    } = useDataContext();
    const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [toolbarActions, setToolbarActions] = useState<Array<{
        icon: React.ReactNode;
        label: string;
        onClick: () => void;
        disabled?: boolean;
    }>>([]);
    const theme = useTheme();
    
    const prevChannelId = useRef<string | null>(null);
    const prevThreadId = useRef<string | null>(null);

    const handleArtifactClick = (artifact: Artifact) => {
        setSelectedArtifact(artifact);
        setDrawerOpen(true);
    };

    const handleDrawerClose = () => {
        setDrawerOpen(false);
    };
    

    return (
        <Box sx={{ p: 1, height: '100%', overflowY: 'auto' }}>
            
            <Typography variant="h6" sx={{ mb: 2, color: 'text.primary' }}>
                Artifacts
            </Typography>
            <Divider sx={{ mb: 2 }} />
            <List>
                {(artifacts || []).map((artifact: Artifact) => (
                    <ArtifactCard
                        key={artifact.id}
                        artifact={artifact}
                        onClick={() => handleArtifactClick(artifact)}
                        onAddClick={(e) => {
                            e.stopPropagation();
                            if (currentChannelId) {
                                addArtifactToChannel(currentChannelId, artifact.id);
                            }
                        }}
                        onRemoveClick={(e) => {
                            e.stopPropagation();
                            if (currentChannelId) {
                                removeArtifactFromChannel(currentChannelId, artifact.id);
                            }
                        }}
                    />
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
                    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <ActionToolbar actions={[
                            {
                                icon: <ChevronLeftIcon />,
                                label: 'Previous Artifact',
                                onClick: () => {
                                    const currentIndex = artifacts.findIndex(a => a.id === selectedArtifact.id);
                                    const prevArtifact = artifacts[currentIndex - 1];
                                    if (prevArtifact) {
                                        setSelectedArtifact(prevArtifact);
                                    }
                                },
                                disabled: artifacts.findIndex(a => a.id === selectedArtifact.id) === 0
                            },
                            {
                                icon: <AddIcon />,
                                label: 'Add to Channel',
                                onClick: () => {
                                    if (currentChannelId && selectedArtifact) {
                                        addArtifactToChannel(currentChannelId, selectedArtifact.id);
                                    }
                                }
                            },
                            {
                                icon: <RemoveIcon />,
                                label: 'Remove from Channel',
                                onClick: () => {
                                    if (currentChannelId && selectedArtifact) {
                                        removeArtifactFromChannel(currentChannelId, selectedArtifact.id);
                                    }
                                }
                            },
                            {
                                icon: <ChevronRightIcon />,
                                label: 'Next Artifact',
                                onClick: () => {
                                    const currentIndex = artifacts.findIndex(a => a.id === selectedArtifact.id);
                                    const nextArtifact = artifacts[currentIndex + 1];
                                    if (nextArtifact) {
                                        setSelectedArtifact(nextArtifact);
                                    }
                                },
                                disabled: artifacts.findIndex(a => a.id === selectedArtifact.id) === artifacts.length - 1
                            },
                            {
                                icon: <CloseIcon />,
                                label: 'Close',
                                onClick: () => setDrawerOpen(false)
                            },
                            ...(toolbarActions || [])
                        ]} />
                        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                            <ArtifactDisplay
                                artifact={selectedArtifact}
                                onDelete={() => setDrawerOpen(false)}
                                onEdit={() => {
                                    // Handle edit action
                                }}
                                onAddToolbarActions={(actions) => {
                                    // Only set the additional actions, keep the core navigation actions
                                    setToolbarActions(actions);
                                }}
                            />
                        </Box>
                    </Box>
                )}
            </Drawer>
        </Box>
    );
};
