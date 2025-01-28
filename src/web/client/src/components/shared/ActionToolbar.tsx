import React from 'react';
import { Box, Button, IconButton, Tooltip } from '@mui/material';
import DescriptionIcon from '@mui/icons-material/Description';

interface ActionToolbarProps {
    actions: Array<{
        icon: React.ReactNode;
        label: string;
        onClick: () => void;
        disabled?: boolean;
    }>;
}

export const ActionToolbar: React.FC<ActionToolbarProps> = ({ actions }) => {
    return (
        <Box sx={{ 
            position: 'fixed',
            bottom: 32,
            right: 32,
            display: 'flex',
            gap: 1,
            zIndex: 1200
        }}>
            {actions.map((action, index) => (
                <Tooltip key={index} title={action.label}>
                    <IconButton
                        color="primary"
                        onClick={action.onClick}
                        disabled={action.disabled}
                        sx={{
                            backgroundColor: 'primary.main',
                            color: 'white',
                            '&:hover': {
                                backgroundColor: 'primary.dark'
                            }
                        }}
                    >
                        {action.icon}
                    </IconButton>
                </Tooltip>
            ))}
        </Box>
    );
};
