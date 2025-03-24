import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { useToolbarActions } from '../contexts/ToolbarActionsContext';
import { Artifact, ArtifactItem } from '../../../../tools/artifact';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import { Box, Typography, List, useTheme } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import { ArtifactDrawer } from './ArtifactDrawer';
import { ArtifactCard } from './ArtifactCard';
import { useFilteredArtifacts } from '../contexts/FilteredArtifactContext';
import { useChannels } from '../contexts/ChannelContext';

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
    const theme = useTheme();

    const isPinned = useCallback((artifact?: ArtifactItem) => {
        if (!currentChannelId || !artifact) return false;
        const currentChannel = channels.find(c => c.id === currentChannelId);
        return currentChannel?.artifactIds?.includes(artifact.id) || false;
    }, [currentChannelId, channels]);

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
                onClose={() => handleDrawerClose()}
                currentArtifact={currentArtifact}
                artifacts={artifacts}
                onArtifactChange={(artifact) => setArtifactId(artifact.id)}
                showNavigation={true}
                showPinActions={true}
            />
        </Box>
    );
};
