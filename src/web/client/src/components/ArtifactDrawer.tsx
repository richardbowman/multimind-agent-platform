import React from 'react';
import { Artifact } from '../../../../tools/artifact';
import { ActionToolbar } from './shared/ActionToolbar';
import { Box, Drawer, styled } from '@mui/material';
import { ArtifactDisplay } from './shared/ArtifactDisplay';

const DrawerHeader = styled('div')(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    padding: theme.spacing(0, 1),
    ...theme.mixins.toolbar,
    justifyContent: 'flex-start',
}));

interface ArtifactDrawerProps {
    open: boolean;
    onClose: () => void;
    currentArtifact: Artifact | null;
    actions: Array<{
        icon?: React.ReactNode;
        label: string;
        onClick: () => void;
        disabled?: boolean;
        variant?: 'text' | 'outlined' | 'contained';
        color?: 'inherit' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';
    }>;
}

export const ArtifactDrawer: React.FC<ArtifactDrawerProps> = ({ 
    open, 
    onClose, 
    currentArtifact, 
    actions 
}) => {
    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{
                sx: {
                    width: '40%'
                }
            }}
        >
            <DrawerHeader/>
            {currentArtifact && (
                <Box sx={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <ActionToolbar actions={actions}/>
                    <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
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
