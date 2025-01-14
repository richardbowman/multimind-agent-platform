import React, { useEffect, useState, useMemo } from 'react';
import { TaskStatus } from '../../../../schemas/reviewProgress';
import { useWebSocket } from '../contexts/DataContext';
import { 
    Box, 
    Typography, 
    List, 
    ListItem, 
    ListItemText, 
    Checkbox,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Stack
} from '@mui/material';

interface TaskPanelProps {
    channelId: string | null;
    threadId: string | null;
}

export const TaskPanel: React.FC<TaskPanelProps> = ({ channelId, threadId }) => {
    const { tasks, fetchTasks, handles } = useWebSocket();
    const [selectedTask, setSelectedTask] = useState<any>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

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
                            setSelectedTask(task);
                            setDialogOpen(true);
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

            <Dialog 
                open={dialogOpen} 
                onClose={() => setDialogOpen(false)}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>Task Details</DialogTitle>
                <DialogContent>
                    {selectedTask && (
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <Typography variant="body1">
                                <strong>Description:</strong> {selectedTask.description}
                            </Typography>
                            <Typography variant="body1">
                                <strong>Status:</strong> {selectedTask.complete ? 'Complete' : (selectedTask.inProgress ? 'In Progress' : 'Not Started')}
                            </Typography>
                            <Typography variant="body1">
                                <strong>Created At:</strong> {new Date(selectedTask.createdAt).toLocaleString()}
                            </Typography>
                            <Typography variant="body1">
                                <strong>Last Updated:</strong> {new Date(selectedTask.updatedAt).toLocaleString()}
                            </Typography>
                            <Typography variant="body1">
                                <strong>Type:</strong> {selectedTask.type}
                                {selectedTask.props?.stepType && ` (${selectedTask.props.stepType})`}
                            </Typography>
                            <Typography variant="body1">
                                <strong>Assignee:</strong> {selectedTask.assignee ? (handles.find(h => h.id === selectedTask.assignee)?.handle || selectedTask.assignee) : 'Unassigned'}
                            </Typography>
                            {selectedTask.dependsOn && (
                                <Typography variant="body1">
                                    <strong>Depends On:</strong> {selectedTask.dependsOn}
                                </Typography>
                            )}
                            {selectedTask.props && Object.entries(selectedTask.props).map(([key, value]) => (
                                <Box key={key} sx={{ 
                                    p: 1,
                                    bgcolor: 'background.paper',
                                    borderRadius: 1,
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    mb: 1
                                }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 'bold' }}>
                                        {key}
                                    </Typography>
                                    <Typography variant="body2" sx={{ 
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word'
                                    }}>
                                        {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                    </Typography>
                                </Box>
                            ))}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
