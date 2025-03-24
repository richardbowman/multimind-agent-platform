import React from 'react';
import { 
    Box, 
    Typography, 
    ListItem, 
    ListItemText, 
    Checkbox,
    Tooltip
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import FolderIcon from '@mui/icons-material/Folder';
import TaskIcon from '@mui/icons-material/Task';
import FlagIcon from '@mui/icons-material/Flag';
import RepeatIcon from '@mui/icons-material/Repeat';
import DirectionsWalkIcon from '@mui/icons-material/DirectionsWalk';
import { useDataContext } from '../contexts/DataContext';

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
    const { handles } = useDataContext();

    return (
        <ListItem 
            sx={{
                mb: 1,
                bgcolor: selected 
                    ? task.inProgress
                        ? task.props?.result?.async
                            ? 'action.disabledBackground'
                            : 'primary.dark'
                        : 'primary.dark'
                    : task.inProgress 
                        ? task.props?.result?.async
                            ? 'action.disabledBackground'
                            : 'action.selected'
                        : task.status === 'cancelled'
                            ? 'primary.disabledBackground'
                            : task.complete
                                ? 'action.disabledBackground'
                                : 'background.paper',
                borderRadius: 1,
                border: '1px solid',
                borderColor: selected 
                    ? task.inProgress
                        ? task.props?.isAsync
                            ? 'warning.dark'
                            : 'primary.dark'
                        : 'primary.main'
                    : task.inProgress
                        ? task.props?.isAsync
                            ? 'warning.main'
                            : 'primary.main'
                        : task.status === 'cancelled'
                            ? 'error.main'
                            : task.complete
                                ? 'divider'
                                : 'divider',
                cursor: 'pointer',
                '&:hover': {
                    bgcolor: selected 
                        ? 'primary.disabledBackground' 
                        : task.inProgress
                            ? task.props?.result?.async
                                ? 'action.disabledBackground'
                                : 'action.hover'
                            : task.status === 'cancelled'
                                ? 'error.light'
                                : task.complete
                                    ? 'action.disabledBackground'
                                    : 'action.hover'
                },
                textDecoration: task.complete || task.status === 'cancelled' ? 'line-through' : 'none',
                opacity: task.complete || task.status === 'cancelled' ? 0.7 : 1
            }}
            onClick={onClick}
        >
            <Box sx={{ position: 'relative', mr: 1 }}>
                <Checkbox
                    checked={task.complete}
                    disabled={!task.complete && !task.inProgress}
                    sx={{ 
                        color: task.inProgress ? 'primary.main' : 'action.disabled',
                        '&.Mui-checked': {
                            color: 'primary.main',
                        },
                        textDecoration: task.complete ? 'line-through' : 'none',
                        opacity: task.complete ? 0.7 : 1
                    }}
                    onClick={onCheckboxClick}
                />
                {task.inProgress && task.props?.result?.async && (
                    <AccessTimeIcon
                        sx={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: 16,
                            height: 16,
                            color: 'text.secondary',
                            bgcolor: 'background.paper',
                            borderRadius: '50%',
                            p: 0.5
                        }}
                    />
                )}
                {task.inProgress && task.props?.childProjectId && (
                    <FolderIcon
                        sx={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            width: 16,
                            height: 16,
                            color: 'text.secondary',
                            bgcolor: 'background.paper',
                            borderRadius: '50%',
                            p: 0.5
                        }}
                    />
                )}
            </Box>
            <ListItemText
                primary={task.description}
                primaryTypographyProps={{ 
                    color: selected && task.inProgress ? '#fff' : 'text.primary',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    textDecoration: task.complete ? 'line-through' : 'none',
                    opacity: task.complete ? 0.7 : 1
                }}
                secondary={
                    <React.Fragment>
                        {task.assignee && (
                            <Typography 
                                variant="caption" 
                                component="span"
                                sx={{ 
                                    display: 'inline-block',
                                    color: 'text.secondary',
                                    textDecoration: task.complete ? 'line-through' : 'none',
                                    opacity: task.complete ? 0.7 : 1,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    maxWidth: '100%'
                                }}
                            >
                                {handles.find(h => h.id === task.assignee)?.handle || task.assignee}
                            </Typography>
                        )}
                        <Typography 
                            variant="caption" 
                            component="span"
                            sx={{ 
                                display: 'block',
                                color: task.inProgress ? 'rgba(0, 0, 0, 0.7)' : 'text.secondary',
                                textDecoration: task.complete ? 'line-through' : 'none',
                                opacity: task.complete ? 0.7 : 1
                            }}
                        >
                            <Box component="span" sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center' }}>
                                <Tooltip title={task.type}>
                                    {task.type === 'goal' && <FlagIcon fontSize="small" />}
                                    {task.type === 'step' && <DirectionsWalkIcon fontSize="small" />}
                                    {task.type === 'recurring' && <RepeatIcon fontSize="small" />}
                                    {task.type === 'standard' && <TaskIcon fontSize="small" />}
                                </Tooltip>
                                {task.props?.stepType && (
                                    <Typography variant="caption" component="span">
                                        ({task.props.stepType})
                                    </Typography>
                                )}
                            </Box>
                        </Typography>
                    </React.Fragment>
                }
            />
        </ListItem>
    );
};
