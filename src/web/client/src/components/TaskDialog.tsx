import React from 'react';
import { 
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Stack,
    Typography,
    Box,
    List,
    ListItem,
    ListItemText
} from '@mui/material';
import { useWebSocket, useIPCService } from '../contexts/DataContext';
import { LoadingButton } from '@mui/lab';

interface TaskDialogProps {
    open: boolean;
    onClose: () => void;
    selectedTask: any;
    setSelectedTask: (task: any) => void;
    tasks: any[];
}

export const TaskDialog: React.FC<TaskDialogProps> = ({ 
    open, 
    onClose, 
    selectedTask, 
    setSelectedTask,
    tasks
}) => {
    const { handles, tasks: allTasks } = useWebSocket();
    const ipcService = useIPCService();
    
    // Filter tasks to only show those from the current project
    const projectTasks = React.useMemo(() => {
        if (!tasks || tasks.length === 0) return [];
        const projectId = tasks[0]?.projectId;
        if (!projectId) return tasks;
        return allTasks.filter(t => t.projectId === projectId);
    }, [tasks, allTasks]);

    return (
        <Dialog 
            open={open} 
            onClose={onClose}
            maxWidth="md"
            fullWidth
        >
            <DialogTitle>Task Details</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Box sx={{ width: '30%', overflowY: 'auto', p: 1 }}>
                        <Typography variant="h6" sx={{ mb: 1 }}>Project Tasks</Typography>
                        <List>
                            {projectTasks.map(task => (
                                <ListItem 
                                    key={task.id}
                                    sx={{
                                        mb: 1,
                                        bgcolor: task.id === selectedTask?.id ? 'primary.light' : 'background.paper',
                                        borderRadius: 1,
                                        border: '1px solid',
                                        borderColor: task.id === selectedTask?.id ? 'primary.main' : 'divider',
                                        cursor: 'pointer',
                                        '&:hover': {
                                            bgcolor: task.id === selectedTask?.id ? 'primary.dark' : 'action.hover'
                                        }
                                    }}
                                    onClick={() => setSelectedTask(task)}
                                >
                                    <ListItemText
                                        primary={task.description}
                                        primaryTypographyProps={{ 
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis'
                                        }}
                                        secondary={
                                            <Typography 
                                                variant="caption" 
                                                component="span"
                                                sx={{ display: 'block' }}
                                            >
                                                {task.complete ? 'Complete' : (task.inProgress ? 'In Progress' : 'Not Started')}
                                            </Typography>
                                        }
                                    />
                                </ListItem>
                            ))}
                        </List>
                    </Box>
                    <Box sx={{ width: '70%' }}>
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
                    </Box>
                </Box>
            </DialogContent>
            <DialogActions>
                {selectedTask && (
                    <LoadingButton
                        variant="contained"
                        color={selectedTask.complete ? "secondary" : "primary"}
                        onClick={async () => {
                            try {
                                await ipcService.getRPC().markTaskComplete(selectedTask.id, !selectedTask.complete);
                                setSelectedTask({
                                    ...selectedTask,
                                    complete: !selectedTask.complete,
                                    inProgress: selectedTask.complete ? false : selectedTask.inProgress
                                });
                            } catch (error) {
                                console.error('Failed to update task:', error);
                            }
                        }}
                    >
                        {selectedTask.complete ? 'Mark Incomplete' : 'Mark Complete'}
                    </LoadingButton>
                )}
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};
