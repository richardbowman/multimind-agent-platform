import React, { useEffect } from 'react';
import { Artifact } from '../../../../tools/artifact';
import { ActionToolbar } from './shared/ActionToolbar';
import { Box, Drawer, styled } from '@mui/material';
import { ArtifactDisplay } from './shared/ArtifactDisplay';
import { useToolbarActions } from '../contexts/ToolbarActionsContext';
import { Close } from '@mui/icons-material';

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
}

export const ArtifactDrawer: React.FC<ArtifactDrawerProps> = ({ 
    open, 
    onClose, 
    currentArtifact
}) => {
    const { actions, registerActions, updateActionState, unregisterActions } = useToolbarActions();

    useEffect(() => {
        registerActions("artifact-drawer", [{
            icon: <Close/>,
            id: "artifact-close",
            label: "Close Drawer",
            onClick: onClose
        }]);

        return () => { unregisterActions("artifact-drawer"); }
    }, []);

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
