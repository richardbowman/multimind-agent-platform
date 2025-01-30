import React from 'react';
import { Box, Button, IconButton, Tooltip } from '@mui/material';

interface ActionToolbarProps {
    title?: string;
    actions: Array<{
        icon?: React.ReactNode;
        label: string;
        onClick: () => void;
        disabled?: boolean;
        variant?: 'text' | 'outlined' | 'contained';
        color?: 'inherit' | 'primary' | 'secondary' | 'success' | 'error' | 'info' | 'warning';
    }>;
    align?: 'left' | 'right' | 'center' | 'space-between';
}

export const ActionToolbar: React.FC<ActionToolbarProps> = ({ title, actions, align = 'right' }) => {
    return (
        <Box sx={{
            width: '100%',
            backgroundColor: 'background.paper',
            borderBottom: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            gap: 1,
            padding: 1,
            alignItems: 'center',
            justifyContent: align === 'space-between' ? 'space-between' : `flex-${align}`
        }}>
            {title && (
                <Box sx={{ 
                    flexGrow: align === 'space-between' ? 1 : 0,
                    fontWeight: 'bold',
                    paddingLeft: 1
                }}>
                    {title}
                </Box>
            )}
            <Box sx={{ display: 'flex', gap: 1 }}>
                {actions?.map((action, index) => (
                    action.icon ? (
                        <Tooltip key={index} title={action.label}>
                            <IconButton
                                size="small"
                                onClick={action.onClick}
                                disabled={action.disabled}
                                color={action.color || 'inherit'}
                            >
                                {action.icon}
                            </IconButton>
                        </Tooltip>
                    ) : (
                        <Button
                            key={index}
                            variant={action.variant || 'text'}
                            onClick={action.onClick}
                            disabled={action.disabled}
                            color={action.color || 'primary'}
                            size="small"
                        >
                            {action.label}
                        </Button>
                    )
                ))}
            </Box>
        </Box>
    );
};
