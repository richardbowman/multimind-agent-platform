import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useToolbarActions } from '../contexts/ToolbarActionsContext';
import { Artifact, ArtifactItem } from '../../../../tools/artifact';
import { useDataContext } from '../contexts/DataContext';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import { ArtifactDisplay } from './shared/ArtifactDisplay';
import { ActionToolbar } from './shared/ActionToolbar';
import { Box, Typography, List, useTheme } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import { ArtifactDrawer } from './ArtifactDrawer';
import { ArtifactCard } from './ArtifactCard';
import { useFilteredArtifacts } from '../contexts/FilteredArtifactContext';
import { useChannels } from '../contexts/ChannelContext';
import { useArtifacts } from '../contexts/ArtifactContext';

interface ArtifactPanelProps {
    channelId: string | null;
    threadId: string | null;
}


export const ArtifactChatPanel: React.FC<ArtifactPanelProps> = ({ channelId, threadId }) => {
    const { 
        filteredArtifacts: allArtifacts,
        currentArtifact,
        setArtifactId,
    } = useFilteredArtifacts();
    const { 
        currentChannelId,
        channels,
        addArtifactToChannel,
        removeArtifactFromChannel
    } = useChannels();

    // When viewing main channel, show pinned artifacts
    const artifacts = useMemo(() => {
        if (!channelId) {
            const currentChannel = channels.find(c => c.id === currentChannelId);
            const pinnedArtifactIds = currentChannel?.artifactIds || [];
            return allArtifacts.filter(a => pinnedArtifactIds.includes(a.id));
        }
        return allArtifacts;
    }, [allArtifacts, channelId, currentChannelId, channels]);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const { actions, registerActions, unregisterActions, updateActionState } = useToolbarActions();
    const theme = useTheme();
    
    const prevChannelId = useRef<string | null>(null);
    const prevThreadId = useRef<string | null>(null);

    const isPinned = useCallback((artifact?: Artifact) => {
        if (!currentChannelId) return false;
        const targetArtifact = artifact || currentArtifact;
        if (!targetArtifact) return false;
        
        // Check if the artifact is in the current channel's artifactIds
        const currentChannel = channels.find(c => c.id === currentChannelId);
        return currentChannel?.artifactIds?.includes(targetArtifact.id) || false;
    }, [currentArtifact, currentChannelId, channels]);

    useEffect(() => {
        if (!currentArtifact) return;

        const navigationActions = [
            {
                icon: <ChevronLeftIcon />,
                label: 'Previous Artifact',
                onClick: () => {
                    const currentIndex = artifacts.findIndex(a => a.id === currentArtifact.id);
                    const prevArtifact = artifacts[currentIndex - 1];
                    if (prevArtifact) {
                        setArtifactId(prevArtifact.id);
                    }
                },
                disabled: artifacts.findIndex(a => a.id === currentArtifact.id) === 0
            },
            {
                id: 'artifact-panel-pin',
                icon: isPinned(currentArtifact) ? <PushPinIcon /> : <PushPinOutlinedIcon />,
                label: isPinned(currentArtifact) ? 'Unpin from Channel' : 'Pin to Channel',
                onClick: () => {
                    if (currentChannelId && currentArtifact) {
                        if (isPinned(currentArtifact)) {
                            removeArtifactFromChannel(currentChannelId, currentArtifact.id);
                        } else {
                            addArtifactToChannel(currentChannelId, currentArtifact.id);
                        }
                    }
                }
            },
            {
                id: 'artifact-panel-next',
                icon: <ChevronRightIcon />,
                label: 'Next Artifact',
                onClick: () => {
                    const currentIndex = artifacts.findIndex(a => a.id === currentArtifact.id);
                    const nextArtifact = artifacts[currentIndex + 1];
                    if (nextArtifact) {
                        setArtifactId(nextArtifact.id);
                    }
                },
                disabled: artifacts.findIndex(a => a.id === currentArtifact.id) === artifacts.length - 1
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
    }, [currentArtifact, artifacts, currentChannelId, isPinned, registerActions, unregisterActions]);

    // Update pin state when artifact or channel changes
    // Update pin state when selected artifact or channel changes
    useEffect(() => {
        if (currentArtifact && currentChannelId) {
            updateActionState('artifact-panel-pin', { 
                icon: isPinned(currentArtifact) ? <PushPinIcon /> : <PushPinOutlinedIcon />,
                label: isPinned(currentArtifact) ? 'Unpin from Channel' : 'Pin to Channel'
            });
        }
    }, [currentArtifact, currentChannelId, isPinned, updateActionState]);

    const handleArtifactClick = (artifact: ArtifactItem) => {
        setArtifactId(artifact.id);
        setDrawerOpen(true);
    };

    const handleDrawerClose = () => {
        setDrawerOpen(false);
    };
    

    return (
        <Box sx={{ p: 1, height: '100%', overflowY: 'auto' }}>
            
            <Typography variant="h6">
                Artifacts
            </Typography>
            <List>
                {(artifacts || []).sort((a, b) => {
                    const aPinned = isPinned(a);
                    const bPinned = isPinned(b);
                    // Pinned items come first
                    if (aPinned && !bPinned) return -1;
                    if (!aPinned && bPinned) return 1;
                    // Otherwise maintain original order
                    return 0;
                }).map((artifact: Artifact) => (
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
                        isPinned={isPinned(artifact)}
                    />
                ))}
            </List>

            <ArtifactDrawer
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                currentArtifact={currentArtifact}
                actions={actions}
            />
        </Box>
    );
};
