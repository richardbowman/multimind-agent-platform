import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button, Box
} from '@mui/material';
import { useDataContext } from '../contexts/DataContext';
import { useTasks } from '../contexts/TaskContext';
import { useEffect, useState } from 'react';
import { useArtifacts } from '../contexts/ArtifactContext';
import { useIPCService } from '../contexts/IPCContext';
import { TaskListPanel } from './TaskListPanel';
import { TaskDetailsPanel } from './TaskDetailsPanel';

interface TaskDialogProps {
    open: boolean;
    onClose: () => void;
    selectedTask: any;
    setSelectedTask: (task: any) => void;
    tasks: any[];
    parentTask?: any;
    setParentTask?: (task: any) => void;
}

export const TaskDialog: React.FC<TaskDialogProps> = ({ 
    open, 
    onClose, 
    selectedTask, 
    setSelectedTask,
    tasks: initialTasks,
}) => {
    const { handles } = useDataContext();
    const ipcService = useIPCService();
    const { tasks, markTaskComplete, saveTask } = useTasks();
    const [projectDetails, setProjectDetails] = useState<any>(null);
    const { artifacts } = useArtifacts();
    const { tasks: allTasks } = useTasks();
    const [projectTasks, setProjectTasks] = useState<any[]>([]);

    const fetchTasks = async () => {
        if (!selectedTask) return;
        const projectId = selectedTask.projectId;

        try {
            // Get tasks for this project from context
            const projectTasks = allTasks.filter(t => t.projectId === projectId);
            setProjectTasks(projectTasks);

            // If no selected task yet, select the first task
            if (!selectedTask && projectTasks.length > 0) {
                setSelectedTask(projectTasks[0]);
            }
        } catch (error) {
            console.error('Failed to fetch project tasks:', error);
            setProjectTasks([]);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, [allTasks, selectedTask]);

    useEffect(() => {
        const fetchProjectDetails = async () => {
            if (!selectedTask) return;
            const projectId = selectedTask.projectId;
            if (!projectId) return;

            try {
                // Fetch project details
                const project = await ipcService.getRPC().getProject(projectId);
                setProjectDetails(project);
            } catch (error) {
                console.error('Failed to fetch project details:', error);
                setProjectDetails({
                    id: projectId,
                    name: 'Error loading project',
                    description: error instanceof Error ? error.message : 'Failed to load project details',
                    metadata: {
                        status: 'error'
                    }
                });
                setProjectTasks([]);
            }
        };

        fetchProjectDetails();
    }, [ipcService, selectedTask?.projectId]);

    return (
        <Dialog 
            open={open} 
            onClose={onClose}
            maxWidth="md"
            fullWidth
            sx={{
                display: 'flex',
                overflow: 'hidden'
            }}
            slotProps={{
                paper: {
                    sx: {
                        display: 'flex', 
                        overflowY: 'hidden'
                    }
                }
            }}
        >
            <DialogTitle>Task Details</DialogTitle>
            <DialogContent sx={{
                display: 'flex', 
                overflowY: 'hidden'
            }}>
                <Box sx={{ display: 'flex', overflow: 'hidden', gap: 2 }}>
                    <TaskListPanel 
                        projectTasks={projectTasks}
                        selectedTask={selectedTask}
                        onSelectTask={setSelectedTask}
                    />
                    <TaskDetailsPanel
                        selectedTask={selectedTask}
                        projectDetails={projectDetails}
                        artifacts={artifacts}
                        handles={handles}
                        onViewParentTask={async (taskId) => {
                            const parentTask = tasks.find(t => t.id === taskId);
                            if (parentTask) {
                                setSelectedTask(parentTask);
                            }
                        }}
                        onViewChildTask={async (taskId) => {
                            const childTasks = tasks.filter(t => t.projectId === taskId);
                            if (childTasks.length > 0) {
                                setSelectedTask(childTasks[0]);
                                setProjectTasks(childTasks);
                            }
                        }}
                    />
                </Box>
            </DialogContent>
            <DialogActions>
                {selectedTask && !selectedTask.complete && (
                    <Button
                        variant="contained"
                        color="error"
                        onClick={async () => {
                            try {
                                await markTaskComplete(selectedTask.id, false); // Use context method
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
                    </Button>
                )}
                {selectedTask && (
                    <Button
                        variant="contained"
                        color={selectedTask.complete ? "secondary" : "primary"}
                        onClick={async () => {
                            try {
                                await markTaskComplete(selectedTask.id, !selectedTask.complete);

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
                    </Button>
                )}
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
};
