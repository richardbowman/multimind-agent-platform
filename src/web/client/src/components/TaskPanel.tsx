import React, { useEffect, useState } from 'react';
import { useWebSocket } from '../contexts/DataContext';
import { 
    Box, 
    Typography, 
    List, 
    ListItem, 
    ListItemText, 
    Checkbox
} from '@mui/material';
import { TaskDialog } from './TaskDialog';

interface TaskPanelProps {
    channelId: string | null;
    threadId: string | null;
    selectedTask: any;
    setSelectedTask: (task: any) => void;
    dialogOpen: boolean;
    setDialogOpen: (open: boolean) => void;
}

export const TaskPanel: React.FC<TaskPanelProps> = ({ 
    channelId, 
    threadId,
    selectedTask,
    setSelectedTask,
    dialogOpen,
    setDialogOpen
}) => {
    const { tasks, fetchTasks, handles } = useWebSocket();
    const [localSelectedTask, setLocalSelectedTask] = useState<any>(null);
    const [localDialogOpen, setLocalDialogOpen] = useState(false);

    useEffect(() => {
        let isSubscribed = true;

        const loadTasks = async () => {
            if (channelId && isSubscribed) {
                await fetchTasks(channelId, threadId);
            }
        };

        loadTasks();

        return () => {
            isSubscribed = false;
        };
    }, [channelId, threadId]);


    return (
        <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
            <Typography variant="h6" sx={{ mb: 2, color: '#fff' }}>
                Tasks
            </Typography>
            <List>
                {(tasks || [])
                    .sort((a, b) => {
                        // Sort in-progress to top, then not started, then completed
                        if (a.inProgress && !b.inProgress) return -1;
                        if (!a.inProgress && b.inProgress) return 1;
                        if (a.complete && !b.complete) return 1;
                        if (!a.complete && b.complete) return -1;
                        return 0;
                    })
                    .map(task => (
                    <ListItem 
                        key={task.id}
                        sx={{
                            mb: 1,
                            bgcolor: task.inProgress ? 'primary.light' : 'background.paper',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: task.inProgress ? 'primary.main' : 'divider',
                            cursor: 'pointer',
                            '&:hover': {
                                bgcolor: task.inProgress ? 'primary.dark' : 'action.hover'
                            },
                            textDecoration: task.complete ? 'line-through' : 'none',
                            opacity: task.complete ? 0.7 : 1
                        }}
                        onClick={() => {
                        }}
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
                            onClick={(e) => {
                                e.stopPropagation();
                                setLocalSelectedTask(task);
                                setLocalDialogOpen(true);
                            }}
                        />
                        <ListItemText
                            primary={task.description}
                            primaryTypographyProps={{ 
                                color: task.inProgress ? '#000' : '#fff',
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
                                            color: task.inProgress ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.7)',
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
                ))}
            </List>

            <TaskDialog
                open={localDialogOpen}
                onClose={() => setLocalDialogOpen(false)}
                selectedTask={localSelectedTask}
                setSelectedTask={setLocalSelectedTask}
                tasks={tasks}
            />
        </Box>
    );
};
