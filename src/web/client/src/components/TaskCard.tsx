import React from 'react';
import { 
    Box, 
    Typography, 
    ListItem, 
    ListItemText, 
    Checkbox
} from '@mui/material';
import { useWebSocket } from '../contexts/DataContext';

interface TaskCardProps {
    task: any;
    selected?: boolean;
    onClick?: () => void;
    onCheckboxClick?: (e: React.MouseEvent) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ 
    task, 
    selected = false,
    onClick,
    onCheckboxClick
}) => {
    const { handles } = useWebSocket();

    return (
        <ListItem 
            sx={{
                mb: 1,
                bgcolor: selected 
                    ? 'primary.light' 
                    : task.inProgress 
                        ? 'action.selected'
                        : task.complete
                            ? 'action.disabledBackground'
                            : 'background.paper',
                borderRadius: 1,
                border: '1px solid',
                borderColor: selected 
                    ? 'primary.main' 
                    : task.inProgress
                        ? 'primary.main'
                        : task.complete
                            ? 'divider'
                            : 'divider',
                cursor: 'pointer',
                '&:hover': {
                    bgcolor: selected 
                        ? 'primary.light' 
                        : task.inProgress
                            ? 'action.hover'
                            : task.complete
                                ? 'action.disabledBackground'
                                : 'action.hover'
                },
                textDecoration: task.complete ? 'line-through' : 'none',
                opacity: task.complete ? 0.7 : 1
            }}
            onClick={onClick}
        >
            <Checkbox
                checked={task.complete}
                disabled={!task.complete && !task.inProgress}
                sx={{ 
                    mr: 1,
                    color: task.inProgress ? 'primary.main' : 'action.disabled',
                    '&.Mui-checked': {
                        color: 'primary.main',
                    },
                    textDecoration: task.complete ? 'line-through' : 'none',
                    opacity: task.complete ? 0.7 : 1
                }}
                onClick={onCheckboxClick}
            />
            <ListItemText
                primary={task.description}
                primaryTypographyProps={{ 
                    color: 'text.primary',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textDecoration: task.complete ? 'line-through' : 'none',
                    opacity: task.complete ? 0.7 : 1
                }}
                secondary={
                    <React.Fragment>
                        <Typography 
                            variant="caption" 
                            component="span"
                            sx={{ 
                                display: 'block',
                                color: 'text.secondary',
                                textDecoration: task.complete ? 'line-through' : 'none',
                                opacity: task.complete ? 0.7 : 1
                            }}
                        >
                            {task.assignee && `Assigned to: ${handles.find(h => h.id === task.assignee)?.handle || task.assignee}`}
                        </Typography>
                        <Typography 
                            variant="caption" 
                            component="span"
                            sx={{ 
                                display: 'block',
                                color: task.inProgress ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.7)',
                                textDecoration: task.complete ? 'line-through' : 'none',
                                opacity: task.complete ? 0.7 : 1
                            }}
                        >
                            Type: {task.type}
                            {task.props?.stepType && ` (${task.props.stepType})`}
                        </Typography>
                    </React.Fragment>
                }
            />
        </ListItem>
    );
};
