import React, { useEffect, useState } from 'react';
import { useTasks } from '../contexts/TaskContext';
import { useFilteredTasks } from '../contexts/FilteredTaskContext';
import { useIPCService } from '../contexts/IPCContext';
import { 
    Box, 
    Typography, 
    List, 
    IconButton,
    Tooltip,
    ToggleButtonGroup,
    ToggleButton
} from '@mui/material';
import CancelIcon from '@mui/icons-material/Cancel';
import PersonIcon from '@mui/icons-material/Person';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ListAltIcon from '@mui/icons-material/ListAlt';
import { TaskDialog } from './TaskDialog';
import { TaskCard } from './TaskCard';

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
    const { tasks, fetchAllTasks } = useTasks();
    const { filteredTasks } = useFilteredTasks();
    const ipcService = useIPCService();
    const [localSelectedTask, setLocalSelectedTask] = useState<any>(null);
    const [localDialogOpen, setLocalDialogOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'user' | 'agent' | 'steps'>('user');

    useEffect(() => {
        let isSubscribed = true;

        const loadTasks = async () => {
            if (channelId && isSubscribed) {
                await fetchAllTasks();
            }
        };

        loadTasks();

        return () => {
            isSubscribed = false;
        };
    }, [channelId, threadId]);


    return (
        <Box sx={{ p: 2, height: '100%', overflowY: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Typography variant="h6" sx={{ color: '#fff', mr: 2 }}>
                    Tasks
                </Typography>
                <ToggleButtonGroup
                    value={viewMode}
                    exclusive
                    onChange={(_, newMode) => setViewMode(newMode)}
                    size="small"
                    sx={{ 
                        '& .MuiToggleButton-root': {
                            color: '#fff',
                            borderColor: '#fff',
                            '&.Mui-selected': {
                                backgroundColor: 'rgba(255, 255, 255, 0.12)'
                            }
                        }
                    }}
                >
                    <ToggleButton value="user">
                        <Tooltip title="User Tasks">
                            <PersonIcon fontSize="small" />
                        </Tooltip>
                    </ToggleButton>
                    <ToggleButton value="agent">
                        <Tooltip title="Agent Tasks">
                            <SmartToyIcon fontSize="small" />
                        </Tooltip>
                    </ToggleButton>
                    <ToggleButton value="steps">
                        <Tooltip title="Step Tasks">
                            <ListAltIcon fontSize="small" />
                        </Tooltip>
                    </ToggleButton>
                </ToggleButtonGroup>
                <Tooltip title="Cancel all outstanding tasks">
                    <IconButton
                        onClick={async () => {
                            const outstandingTasks = tasks.filter(t => 
                                !t.complete && t.status !== 'cancelled'
                            );
                            for (const task of outstandingTasks) {
                                try {
                                    await ipcService.getRPC().cancelTask(task.id);
                                } catch (error) {
                                    console.error('Failed to cancel task:', error);
                                }
                            }
                        }}
                    >
                        <CancelIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
            <List sx={{ display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                {Array.from(new Map((filteredTasks || [])
                    .filter(task => {
                        const userHandle = handles.find(h => h.handle === '@user');
                        if (!userHandle) return false;
                        
                        if (viewMode === 'user') {
                            return task.assignee === userHandle.id;
                        }
                        if (viewMode === 'steps') {
                            return task.type === 'step';
                        }
                        // Agent tasks are those not assigned to the current user and not steps
                        return task.assignee !== userHandle.id && task.type !== 'step';
                    })
                    .map(task => [task.id, task])).values())
                    .sort((a, b) => {
                        // Status priority: in-progress > not started > cancelled > completed
                        const statusPriority = {
                            'inProgress': 0,
                            'notStarted': 1,
                            'cancelled': 2,
                            'completed': 3
                        };
                        
                        const aPriority = statusPriority[a.status] || 1;
                        const bPriority = statusPriority[b.status] || 1;
                        
                        if (aPriority < bPriority) return -1;
                        if (aPriority > bPriority) return 1;
                        return 0;
                    })
                    .map(task => (
                    <TaskCard
                        key={task.id}
                        task={task}
                        onClick={() => {
                            setLocalSelectedTask(task);
                            setLocalDialogOpen(true);
                        }}
                        onCheckboxClick={(e) => {
                            e.stopPropagation();
                            setLocalSelectedTask(task);
                            setLocalDialogOpen(true);
                        }}
                    />
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
