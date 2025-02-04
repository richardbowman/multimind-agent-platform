import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useToolbarActions } from '../contexts/ToolbarActionsContext';
import { Artifact } from '../../../../tools/artifact';
import { useDataContext } from '../contexts/DataContext';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
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
    const { actions, registerActions, unregisterActions, updateActionState } = useToolbarActions();
    const theme = useTheme();
    
    const prevChannelId = useRef<string | null>(null);
    const prevThreadId = useRef<string | null>(null);

    const isPinned = useCallback((artifact?: Artifact) => {
        const targetArtifact = artifact || selectedArtifact;
        return targetArtifact && artifacts.find(a => a.id === targetArtifact.id)?.metadata?.channelIds?.includes(currentChannelId);
    }, [selectedArtifact, artifacts, currentChannelId]);

    useEffect(() => {
        if (!selectedArtifact) return;

        const navigationActions = [
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
                id: 'artifact-panel-pin',
                icon: isPinned(selectedArtifact) ? <PushPinIcon /> : <PushPinOutlinedIcon />,
                label: isPinned(selectedArtifact) ? 'Unpin from Channel' : 'Pin to Channel',
                onClick: () => {
                    if (currentChannelId && selectedArtifact) {
                        if (isPinned(selectedArtifact)) {
                            removeArtifactFromChannel(currentChannelId, selectedArtifact.id);
                        } else {
                            addArtifactToChannel(currentChannelId, selectedArtifact.id);
                        }
                    }
                }
            },
            {
                id: 'artifact-panel-next',
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
                id: 'artifact-panel-close',
                icon: <CloseIcon />,
                label: 'Close',
                onClick: () => setDrawerOpen(false)
            }
        ];

        registerActions('artifact-panel', navigationActions);
        return () => unregisterActions('artifact-panel');
    }, [selectedArtifact, artifacts, currentChannelId, isPinned, registerActions, unregisterActions]);

    // Update pin state when artifact or channel changes
    useEffect(() => {
        if (selectedArtifact) {
            updateActionState('artifact-panel-pin', { 
                icon: isPinned(selectedArtifact) ? <PushPinIcon /> : <PushPinOutlinedIcon />,
                label: isPinned(selectedArtifact) ? 'Unpin from Channel' : 'Pin to Channel'
            });
        }
    }, [selectedArtifact, isPinned, updateActionState, artifacts]);

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
                    <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <ActionToolbar actions={actions}/>
                        <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                            <ArtifactDisplay
                                artifact={selectedArtifact}
                                onDelete={() => setDrawerOpen(false)}
                                onEdit={() => {
                                    // Handle edit action
                                }}
                            />
                        </Box>
                    </Box>
                )}
            </Drawer>
        </Box>
    );
};
