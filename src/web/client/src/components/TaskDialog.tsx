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
import { useWebSocket } from '../contexts/DataContext';
import { useIPCService } from '../contexts/IPCContext';
import { useEffect, useState } from 'react';
import { LoadingButton } from '@mui/lab';
import { TaskCard } from './TaskCard';

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
    const { fetchTasks, handles, tasks: allTasks } = useWebSocket();
    const ipcService = useIPCService();
    const [projectDetails, setProjectDetails] = useState<any>(null);

    useEffect(() => {
        const fetchProjectDetails = async () => {
            if (selectedTask?.projectId) {
                try {
                    const project = await ipcService.getRPC().getProject(selectedTask.projectId);
                    setProjectDetails(project);
                } catch (error) {
                    console.error('Failed to fetch project details:', error);
                }
            }
        };

        fetchProjectDetails();
    }, [tasks, ipcService, selectedTask]);
    
    // Filter tasks to only show unique tasks from the current project
    const projectTasks = React.useMemo(() => {
        const projectId = selectedTask?.projectId;
        if (!projectId) return tasks;
        
        // Create a map to deduplicate tasks by ID
        const taskMap = new Map();
        allTasks.forEach(t => {
            if (t.projectId === projectId && !taskMap.has(t.id)) {
                taskMap.set(t.id, t);
            }
        });
        
        return Array.from(taskMap.values());
    }, [selectedTask, allTasks]);

    return (
        <Dialog 
            open={open} 
            onClose={onClose}
            maxWidth="md"
            fullWidth
        >
            <DialogTitle>Task Details</DialogTitle>
            <DialogContent sx={{
                overflowY: 'hidden'
            }}>
                {projectDetails && (
                    <Box sx={{ 
                        p: 2,
                        mb: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        bgcolor: 'background.paper',
                        borderRadius: 1,
                        border: '1px solid',
                        borderColor: 'divider'
                    }}>
                        <Typography variant="h6" sx={{ mb: 1 }}>
                            Project: {projectDetails.name}
                        </Typography>
                        {projectDetails.description && (
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                {projectDetails.description}
                            </Typography>
                        )}
                        <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>
                            Project ID: {projectDetails.id}
                        </Typography>
                        {projectDetails.metadata?.status && (
                            <Typography variant="caption" sx={{ display: 'block' }}>
                                Status: {projectDetails.metadata.status}
                            </Typography>
                        )}
                        {projectDetails.metadata?.priority && (
                            <Typography variant="caption" sx={{ display: 'block' }}>
                                Priority: {projectDetails.metadata.priority}
                            </Typography>
                        )}
                    </Box>
                )}
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Box sx={{ 
                        width: '30%',
                        overflowY: 'auto',
                        p: 1,
                        borderRight: '1px solid',
                        borderColor: 'divider'
                    }}>
                        <Typography 
                            variant="h6" 
                            sx={{ 
                                mb: 1, 
                                position: 'sticky', 
                                top: 0, 
                                bgcolor: 'background.default', 
                                zIndex: 1,
                                color: 'text.primary'
                            }}
                        >
                            Project Tasks
                        </Typography>
                        <List sx={{ overflowY: 'auto' }}>
                            {projectTasks.map(task => (
                                <TaskCard
                                    key={task.id}
                                    task={task}
                                    selected={task.id === selectedTask?.id}
                                    onClick={() => setSelectedTask(task)}
                                />
                            ))}
                        </List>
                    </Box>
                    <Box sx={{ 
                        width: '70%',
                        height: '70vh',
                        overflowY: 'auto',
                        pl: 2
                    }}>
                        {selectedTask && (
                            <Stack spacing={2} sx={{ mt: 1 }}>
                                <Typography variant="body1">
                                    <strong>Description:</strong> {selectedTask.description}
                                </Typography>
                                <Typography variant="body1">
                                    <strong>Status:</strong> {selectedTask.status === 'cancelled' ? 'Cancelled' : 
                                        selectedTask.status === 'completed' ? 'Complete' : 
                                        selectedTask.status === 'inProgress' ? 'In Progress' : 
                                        'Not Started'}
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
                {selectedTask && !selectedTask.complete && (
                    <LoadingButton
                        variant="contained"
                        color="error"
                        onClick={async () => {
                            try {
                                await ipcService.getRPC().cancelTask(selectedTask.id);
                                setSelectedTask({
                                    ...selectedTask,
                                    status: 'cancelled',
                                    complete: false,
                                    inProgress: false
                                });
                            } catch (error) {
                                console.error('Failed to cancel task:', error);
                            }
                        }}
                    >
                        Cancel Task
                    </LoadingButton>
                )}
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
