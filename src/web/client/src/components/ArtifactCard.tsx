import React from 'react';
import { 
    Box, 
    Typography, 
    ListItem, 
    ListItemText, 
    IconButton,
    Tooltip
} from '@mui/material';
import FolderIcon from '@mui/icons-material/Folder';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

interface ArtifactCardProps {
    artifact: any;
    selected?: boolean;
    onClick?: () => void;
    onAddClick?: (e: React.MouseEvent) => void;
    onRemoveClick?: (e: React.MouseEvent) => void;
}

export const ArtifactCard: React.FC<ArtifactCardProps> = ({ 
    artifact, 
    selected = false,
    onClick,
    onAddClick,
    onRemoveClick
}) => {
    return (
        <ListItem 
            sx={{
                mb: 1,
                bgcolor: selected 
                    ? 'primary.dark'
                    : 'background.paper',
                borderRadius: 1,
                border: '1px solid',
                borderColor: selected 
                    ? 'primary.main'
                    : 'divider',
                cursor: 'pointer',
                '&:hover': {
                    bgcolor: selected 
                        ? 'primary.dark' 
                        : 'action.hover'
                }
            }}
            onClick={onClick}
        >
            <FolderIcon fontSize="small" sx={{ mr: 1, color: 'text.secondary' }} />
            <ListItemText
                primary={artifact.metadata?.title || 'Untitled'}
                secondary={`Type: ${artifact.type} | ID: ${artifact.id}`}
                primaryTypographyProps={{ 
                    color: selected ? '#fff' : 'text.primary',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                }}
                secondaryTypographyProps={{ 
                    color: selected ? 'rgba(255, 255, 255, 0.7)' : 'text.secondary'
                }}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
                <Tooltip title="Add to channel">
                    <IconButton
                        size="small"
                        onClick={onAddClick}
                        sx={{ color: selected ? '#fff' : 'text.secondary' }}
                    >
                        <AddIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Remove from channel">
                    <IconButton
                        size="small"
                        onClick={onRemoveClick}
                        sx={{ color: selected ? '#fff' : 'text.secondary' }}
                    >
                        <RemoveIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
                <ChevronRightIcon sx={{ color: selected ? '#fff' : 'text.secondary' }} />
            </Box>
        </ListItem>
    );
};
