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
            width: '100%',
            backgroundColor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            gap: 1,
            padding: 1,
            alignItems: 'center'
        }}>
            {actions?.map((action, index) => (
                <Tooltip key={index} title={action.label}>
                    <IconButton
                        size="small"
                        onClick={action.onClick}
                        disabled={action.disabled}
                    >
                        {action.icon}
                    </IconButton>
                </Tooltip>
            ))}
        </Box>
    );
};
