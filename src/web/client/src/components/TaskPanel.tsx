import React, { useEffect, useState } from 'react';
import { TaskStatus } from '../../../../schemas/reviewProgress';
import { useWebSocket } from '../contexts/DataContext';
import { 
    Box, 
    Typography, 
    List, 
    ListItem, 
    ListItemText, 
    Chip,
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
    const { tasks, fetchTasks } = useWebSocket();
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

    const getStatusColor = (task: any) => {
        if (task.complete) return 'success';
        if (task.inProgress) return 'primary';
        return 'default';
    };

    return (
        <Box sx={{ p: 2, height: '100%', overflowY: 'auto' }}>
            <Typography variant="h6" sx={{ mb: 2, color: '#fff' }}>
                Tasks
            </Typography>
            <List>
                {(tasks || []).map(task => (
                    <ListItem 
                        key={task.id}
                        sx={{
                            mb: 1,
                            bgcolor: 'background.paper',
                            borderRadius: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            cursor: 'pointer',
                            '&:hover': {
                                bgcolor: 'action.hover'
                            }
                        }}
                        onClick={() => {
                            setSelectedTask(task);
                            setDialogOpen(true);
                        }}
                    >
                        <Chip
                            label={task.complete ? 'Complete' : (task.inProgress ? 'In Progress' : 'Not Started')}
                            color={getStatusColor(task)}
                            size="small"
                            sx={{ mr: 2 }}
                        />
                        <ListItemText
                            primary={task.description}
                            primaryTypographyProps={{ 
                                color: '#fff',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                            }}
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
                            {selectedTask.assignee && (
                                <Typography variant="body1">
                                    <strong>Assignee:</strong> {selectedTask.assignee}
                                </Typography>
                            )}
                            {selectedTask.dependsOn && (
                                <Typography variant="body1">
                                    <strong>Depends On:</strong> {selectedTask.dependsOn}
                                </Typography>
                            )}
                            {selectedTask.metadata && Object.entries(selectedTask.metadata).map(([key, value]) => (
                                <Typography key={key} variant="body1">
                                    <strong>{key}:</strong> {String(value)}
                                </Typography>
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
