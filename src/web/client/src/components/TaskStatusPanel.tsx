import React, { useMemo, useEffect, useState } from 'react';
import { 
    Box, 
    Typography,
    Paper,
    keyframes,
    AppBar,
    Toolbar,
    IconButton,
    Grid2 as Grid,
    Tooltip,
    Dialog,
    ToggleButtonGroup,
    ToggleButton
} from '@mui/material';
import { TaskDialog } from './TaskDialog';
import CancelIcon from '@mui/icons-material/Cancel';
import { ScrollView } from './shared/ScrollView';
import CloseIcon from '@mui/icons-material/Close';
import { useTasks } from '../contexts/TaskContext';
import { TaskCard } from './TaskCard';
import { TaskStatus } from '../../../../schemas/TaskStatus';
import { useIPCService } from '../contexts/IPCContext';

const flyRight = keyframes`
  0% {
    transform: translateX(-100%);
    opacity: 0;
  }
  100% {
    transform: translateX(0);
    opacity: 1;
  }
`;

const flyLeft = keyframes`
  0% {
    transform: translateX(100%);
    opacity: 0;
  }
  100% {
    transform: translateX(0);
    opacity: 1;
  }
`;

const fadeIn = keyframes`
  0% {
    opacity: 0;
    background-color: rgba(255, 255, 255, 0.3);
  }
  50% {
    opacity: 1;
    background-color: rgba(255, 255, 255, 0.6);
  }
  100% {
    background-color: transparent;
  }
`;

export const TaskStatusPanel: React.FC = () => {
    const { tasks } = useTasks();
    const ipcService = useIPCService();
    const [prevTaskPositions, setPrevTaskPositions] = useState<Record<string, TaskStatus>>({});
    const [dialogOpen, setDialogOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<any>(null);
    const [taskTypes, setTaskTypes] = useState<string[]>([]);
    
    // Track task positions for animation
    useEffect(() => {
        const currentPositions = tasks.reduce((acc, task) => {
            acc[task.id] = task.status;
            return acc;
        }, {} as Record<string, TaskStatus>);
        
        setPrevTaskPositions(currentPositions);
    }, [tasks]);

    const getTaskAnimation = (taskId: string, currentStatus: TaskStatus) => {
        const prevStatus = prevTaskPositions[taskId];
        
        if (!prevStatus) return '';
        if (prevStatus === currentStatus) return '';
        
        // Determine animation direction based on status change
        if (prevStatus === TaskStatus.Pending && currentStatus === TaskStatus.InProgress) {
            return `${flyRight} 0.3s ease-in-out`;
        }
        if (prevStatus === TaskStatus.InProgress && currentStatus === TaskStatus.Completed) {
            return `${flyRight} 0.3s ease-in-out`;
        }
        if (prevStatus === TaskStatus.Pending && currentStatus === TaskStatus.Completed) {
            return `${flyRight} 0.5s ease-in-out`;
        }
        if (prevStatus === TaskStatus.InProgress && currentStatus === TaskStatus.Cancelled) {
            return `${flyLeft} 0.3s ease-in-out`;
        }
        
        return '';
    };

    // Group tasks by status with most recent first
    const groupedTasks = useMemo(() => {
        const groups: Record<TaskStatus, typeof tasks> = {
            [TaskStatus.Pending]: [],
            [TaskStatus.InProgress]: [],
            [TaskStatus.Completed]: [],
            [TaskStatus.Cancelled]: []
        } as Record<TaskStatus, typeof tasks>;

        // Group by status first
        tasks.forEach(task => {
            if (task?.status && groups[task.status]) {
                // Filter by task type if any types are selected
                if (taskTypes.length === 0 || taskTypes.includes(task.type)) {
                    groups[task.status].push(task);
                }
            }
        });

        // Then sort each group by update_at (most recently updated first)
        Object.values(groups).forEach(group => {
            group.sort((a, b) => {
                const dateA = new Date(a.props?.updatedAt || a.props?.createdAt).getTime();
                const dateB = new Date(b.props?.updatedAt || b.props?.createdAt).getTime();
                return dateB - dateA; // Descending order (newest first)
            });
        });

        return groups;
    }, [tasks]);

    const statusColors = {
        [TaskStatus.Pending]: 'background.paper',
        [TaskStatus.InProgress]: 'background.paper',
        [TaskStatus.Completed]: 'background.paper',
        [TaskStatus.Cancelled]: 'background.paper'
    };

    const statusLabels = {
        [TaskStatus.Pending]: 'Pending',
        [TaskStatus.InProgress]: 'In Progress',
        [TaskStatus.Completed]: 'Completed',
        [TaskStatus.Cancelled]: 'Cancelled'
    };

    return (
        <Box sx={{ 
            p: 2, 
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0
        }}>
            <Toolbar variant="dense" sx={{ minHeight: 48, gap: 2 }}>
                <Typography variant="h6" component="div">
                    Task Board
                </Typography>
                
                <ToggleButtonGroup
                    value={taskTypes}
                    onChange={(_, newTypes) => setTaskTypes(newTypes)}
                    aria-label="task types"
                    size="small"
                    sx={{ flexGrow: 1 }}
                >
                    <ToggleButton value="research" aria-label="research">
                        Research
                    </ToggleButton>
                    <ToggleButton value="coding" aria-label="coding">
                        Coding
                    </ToggleButton>
                    <ToggleButton value="documentation" aria-label="documentation">
                        Documentation
                    </ToggleButton>
                    <ToggleButton value="other" aria-label="other">
                        Other
                    </ToggleButton>
                </ToggleButtonGroup>

                <Tooltip title="Cancel all outstanding tasks">
                    <IconButton
                        color="inherit"
                        aria-label="cancel-all"
                        size="small"
                        onClick={async () => {
                            const outstandingTasks = tasks.filter(t => 
                                (t.status === TaskStatus.Pending || t.status === TaskStatus.InProgress)
                            );
                            for (const task of outstandingTasks) {
                                try {
                                    await ipcService.getRPC().cancelTask(task.id);
                                } catch (error) {
                                    console.error('Failed to cancel task:', error);
                                }
                            }
                        }}
                        sx={{ mr: 1 }}
                    >
                        <CancelIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Toolbar>
            
            <Box 
                sx={{
                    flexDirection: 'row',
                    display: 'flex',
                    height: '100%',
                    overflow: 'hidden',
                }}
            >
                {Object.entries(groupedTasks).map(([status, tasks]) => (
                    <Box
                        key={status}
                        sx={{
                            display: 'flex',
                            overflow: 'hidden',
                            flex: 1,
                            height: '100%',
                            minWidth: 250
                        }}
                    >
                        <Paper 
                            sx={{ 
                                display: 'flex',
                                flexDirection: 'column',
                                overflow: 'hidden',
                                p: 2,
                                m: 1,
                                flex: 1,
                                bgcolor: statusColors[status as TaskStatus],
                                borderRadius: 2
                            }}
                        >
                        <Typography variant="h6" sx={{ mb: 2 }}>
                            {statusLabels[status as TaskStatus]} ({tasks.length})
                        </Typography>
                        
                        <ScrollView>
                            {tasks.map(task => (
                                <Box 
                                    key={task.id} 
                                    sx={{ 
                                        p: 0,
                                        animation: getTaskAnimation(task.id, task.status),
                                        willChange: 'transform, opacity'
                                    }}
                                >
                                    <TaskCard 
                                        task={task}
                                        onClick={() => {
                                            setSelectedTask(task);
                                            setDialogOpen(true);
                                        }}
                                        onCheckboxClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedTask(task);
                                            setDialogOpen(true);
                                        }}
                                    />
                                </Box>
                            ))}
                        </ScrollView>
                        </Paper>
                    </Box>
                ))}
            </Box>
        <TaskDialog
            open={dialogOpen}
            onClose={() => {
                setDialogOpen(false);
                setSelectedTask(null);
            }}
            selectedTask={selectedTask}
            setSelectedTask={setSelectedTask}
            tasks={tasks}
        />
        </Box>
    );
};
