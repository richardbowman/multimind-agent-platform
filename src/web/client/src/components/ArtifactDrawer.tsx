import React, { useCallback, useEffect } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { ActionToolbar } from './shared/ActionToolbar';
import { Box, Drawer, styled } from '@mui/material';
import { ArtifactDisplay } from './shared/ArtifactDisplay';
import { useToolbarActions } from '../contexts/ToolbarActionsContext';
import { ChevronLeft, ChevronRight, Close, PushPin, PushPinOutlined } from '@mui/icons-material';
import { useChannels } from '../contexts/ChannelContext';

const DrawerHeader = styled('div')(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(0, 1),
    ...theme.mixins.toolbar,
    justifyContent: 'flex-start',
    cursor: 'pointer',
    '&:hover': {
        backgroundColor: theme.palette.action.hover
    }
}));

interface ArtifactDrawerProps {
    open: boolean;
    onClose: () => void;
    currentArtifact: Artifact | null;
    artifacts?: Artifact[];
    onArtifactChange?: (artifact: Artifact) => void;
    showNavigation?: boolean;
    showPinActions?: boolean;
}

export const ArtifactDrawer: React.FC<ArtifactDrawerProps> = ({ 
    open, 
    onClose, 
    currentArtifact,
    artifacts = [],
    onArtifactChange,
    showNavigation = true,
    showPinActions = true
}) => {
    const { actions, registerActions, updateActionState, unregisterActions } = useToolbarActions();
    const { currentChannelId, channels, addArtifactToChannel, removeArtifactFromChannel } = useChannels();

    const isPinned = useCallback((artifact?: Artifact) => {
        if (!currentChannelId || !artifact) return false;
        const currentChannel = channels.find(c => c.id === currentChannelId);
        return currentChannel?.artifactIds?.includes(artifact.id) || false;
    }, [currentChannelId, channels]);

    useEffect(() => {
        if (!currentArtifact) return;

        const baseActions = [{
            icon: <Close/>,
            id: "artifact-close",
            label: "Close Drawer",
            onClick: onClose
        }];

        if (showNavigation && artifacts.length > 1) {
            const currentIndex = artifacts.findIndex(a => a.id === currentArtifact.id);
            baseActions.unshift(
                {
                    icon: <ChevronLeft/>,
                    id: "artifact-prev",
                    label: "Previous Artifact",
                    onClick: () => {
                        const prevIndex = currentIndex - 1;
                        if (prevIndex >= 0 && onArtifactChange) {
                            onArtifactChange(artifacts[prevIndex]);
                        }
                    },
                    disabled: currentIndex <= 0
                },
                {
                    icon: <ChevronRight/>,
                    id: "artifact-next",
                    label: "Next Artifact",
                    onClick: () => {
                        const nextIndex = currentIndex + 1;
                        if (nextIndex < artifacts.length && onArtifactChange) {
                            onArtifactChange(artifacts[nextIndex]);
                        }
                    },
                    disabled: currentIndex >= artifacts.length - 1
                }
            );
        }

        if (showPinActions && currentChannelId) {
            baseActions.push({
                icon: isPinned(currentArtifact) ? <PushPin/> : <PushPinOutlined/>,
                id: "artifact-pin",
                label: isPinned(currentArtifact) ? "Unpin from Channel" : "Pin to Channel",
                onClick: () => {
                    if (isPinned(currentArtifact)) {
                        removeArtifactFromChannel(currentChannelId, currentArtifact.id);
                    } else {
                        addArtifactToChannel(currentChannelId, currentArtifact.id);
                    }
                }
            });
        }

        registerActions("artifact-drawer", baseActions);
        return () => { unregisterActions("artifact-drawer"); }
    }, [currentArtifact, artifacts, onArtifactChange, showNavigation, showPinActions, currentChannelId]);

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    width: '80%',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden' 
                }
            }}
            sx={{
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                zIndex: 1
            }}
            
        >
            <DrawerHeader onClick={onClose}/>
            {currentArtifact && (
                <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
                    <ActionToolbar actions={actions}/>
                    <Box sx={{ display: 'flex', flex: 1, flexDirection: 'column', overflow: 'hidden', p: 2 }}>
                        <ArtifactDisplay
                            artifact={currentArtifact}
                            onDelete={onClose}
                            onEdit={() => {
                                // Handle edit action
                            }}
                        />
                    </Box>
                </Box>
            )}
        </Drawer>
    );
};
