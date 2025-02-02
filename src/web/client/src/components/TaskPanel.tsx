import React, { useEffect, useState } from 'react';
import { useDataContext } from '../contexts/DataContext';
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
    const { tasks, fetchTasks, handles } = useDataContext();
    const ipcService = useIPCService();
    const [localSelectedTask, setLocalSelectedTask] = useState<any>(null);
    const [localDialogOpen, setLocalDialogOpen] = useState(false);
    const [viewMode, setViewMode] = useState<'user' | 'agent'>('user');

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
                </ToggleButtonGroup>
                <Tooltip title="Cancel all outstanding tasks">
                    <IconButton
                        size="small"
                        color="error"
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
                {Array.from(new Map((tasks || [])
                    .filter(task => {
                        if (viewMode === 'user') {
                            return task.userId === handles.userId;
                        }
                        // Agent tasks are those not created by the current user
                        return task.userId !== handles.userId;
                    })
                    .map(task => [task.id, task])).values())
                    .sort((a, b) => {
                        // Sort in-progress to top, then not started, then completed
                        if (a.inProgress && !b.inProgress) return -1;
                        if (!a.inProgress && b.inProgress) return 1;
                        if (a.complete && !b.complete) return 1;
                        if (!a.complete && b.complete) return -1;
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
